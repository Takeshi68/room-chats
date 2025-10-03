'use client';


const IS_DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

// Local store keys
const LS_MESSAGES = 'local_messages';
const BC_NAME = 'chat-demo';

function loadLocalMessages() {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(LS_MESSAGES) || '[]'); } catch { return []; }
}
function saveLocalMessages(arr:any[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LS_MESSAGES, JSON.stringify(arr));
  try { new BroadcastChannel(BC_NAME).postMessage({ type:'messages', data: arr }); } catch {}
}


import { supabase, IS_SUPABASE_ENABLED } from '@/lib/supabase';

/** ====== App-level types (compatible dengan UI kamu) ====== */
export interface Message {
  id: string;             // diserialisasi dari BIGINT/UUID → string
  username: string;
  content: string;
  timestamp: Date;        // from created_at
  userId: string;         // auth.users.id
  fileUrl?: string;
  fileName?: string;
  fileType?: string;
  deletedFor?: string[];  // (dipelihara di sisi UI; sumber DB: message_hides)
}

export interface TypingUser {
  userId: string;
  username: string;
}

/** ====== DB rows shape (untuk mapping) ====== */
type DbMessage = {
  id: number | string;         // BIGINT atau UUID
  room: string;
  user_id: string | null;
  username: string | null;
  content: string | null;
  type: 'text' | 'image' | null;
  attachment_url: string | null;
  deleted_for_all: boolean | null;
  created_at: string;          // ISO
};

type DbHide = {
  id: string;
  user_id: string;
  message_id: number | string;
  created_at: string;
};

/** Util: serialize id apapun → string */
const sid = (v: number | string) => String(v);

/** ====== ChatService ====== */
class ChatService {
  private room = 'general';
  private currentUserId: string | null = null;

  private messages: Message[] = [];
  private hiddenIds = new Set<string>(); // message_id yang di-hide oleh current user
  private typingUsers: Map<string, { username: string; timeout?: any }> = new Map();

  private msgListeners: Set<(messages: Message[]) => void> = new Set();
  private typingListeners: Set<(users: TypingUser[]) => void> = new Set();

  private subMessages: ReturnType<typeof supabase.channel> | null = null;
  private subHides: ReturnType<typeof supabase.channel> | null = null;
  private subTyping: ReturnType<typeof supabase.channel> | null = null;

  /** Panggil sekali pas user sudah login */
  async init(currentUserId: string, room = 'general') {
    this.currentUserId = currentUserId;
    this.room = room;
    // Local/DEMO bootstrap
    if (!IS_SUPABASE_ENABLED) {
      this.messages = loadLocalMessages().map((x:any)=> ({...x, timestamp: new Date(x.timestamp)}));
      this.notifyMessages();
      try {
        const bc = new BroadcastChannel(BC_NAME);
        bc.onmessage = (e:any)=>{
          if(e.data?.type==='messages'){
            this.messages = (e.data.data || []).map((x:any)=> ({...x, timestamp: new Date(x.timestamp)}));
            this.notifyMessages();
          }
        };
      } catch {}
      if (IS_DEMO) {
        // seed demo conversation if empty
        if (this.messages.length === 0) {
          const now = Date.now();
          const seed = [
            { id: String(now-30000), username:'Ayu', content:'hai semua~', timestamp:new Date(now-30000), userId:'u1' },
            { id: String(now-25000), username:'Bima', content:'halo Ayu!', timestamp:new Date(now-25000), userId:'u2' },
            { id: String(now-20000), username:'Cerry', content:'anak baik ngapain di sini? :P', timestamp:new Date(now-20000), userId:'u3' },
          ];
          this.messages = seed as any;
          saveLocalMessages(this.messages);
          this.notifyMessages();
        }
        // demo ticker that posts random messages
        setInterval(()=>{
          const pool = ['lagi ngoding nih','errornya ngeselin bgt','push dulu ya','siap deploy!','makan dulu gaes'];
          const u = [{id:'u2',name:'Bima'},{id:'u3',name:'Cerry'},{id:'u4',name:'Dewi'}][Math.floor(Math.random()*3)];
          const msg = { id: String(Date.now()), username: u.name, content: pool[Math.floor(Math.random()*pool.length)], timestamp: new Date(), userId: u.id };
          const arr = [...this.messages, msg as any];
          this.messages = arr as any;
          saveLocalMessages(arr as any);
          this.notifyMessages();
        }, 12000);
      }
      return;
    }


    // 1) initial load messages
    const { data: rows, error } = await supabase
      .from('messages')
      .select('*')
      .eq('room', this.room)
      .order('created_at', { ascending: true })
      .limit(1000);
    if (error) throw error;

    // 2) load hides untuk user
    const { data: hides, error: errHide } = await supabase
      .from('message_hides')
      .select('*')
      .eq('user_id', this.currentUserId);
    if (errHide) throw errHide;

    this.hiddenIds = new Set((hides ?? []).map(h => sid((h as DbHide).message_id)));

    this.messages = (rows ?? []).map(this.mapDbToMessage).filter(m => !this.hiddenIds.has(m.id));
    this.notifyMessages();

    // 3) realtime: messages
    this.subMessages?.unsubscribe();
    this.subMessages = supabase
      .channel(`rt:messages:${this.room}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `room=eq.${this.room}` },
        (payload) => {
          const row = payload.new as DbMessage;
          const m = this.mapDbToMessage(row);
          if (!this.hiddenIds.has(m.id)) {
            this.messages = [...this.messages, m];
            this.notifyMessages();
          }
        })
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `room=eq.${this.room}` },
        (payload) => {
          const row = payload.new as DbMessage;
          const m = this.mapDbToMessage(row);
          const i = this.messages.findIndex(x => x.id === m.id);
          if (i >= 0) {
            // Kalau deleted_for_all → tampilkan placeholder
            this.messages[i] = m;
            this.notifyMessages();
          }
        })
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'messages', filter: `room=eq.${this.room}` },
        (payload) => {
          const id = sid((payload.old as any).id);
          this.messages = this.messages.filter(x => x.id !== id);
          this.notifyMessages();
        })
      .subscribe();

    // 4) realtime: hides (delete for me)
    this.subHides?.unsubscribe();
    this.subHides = supabase
      .channel(`rt:hides:${this.currentUserId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'message_hides' },
        (payload) => {
          const row = payload.new as DbHide;
          if (row.user_id === this.currentUserId) {
            const id = sid(row.message_id);
            if (!this.hiddenIds.has(id)) {
              this.hiddenIds.add(id);
              this.messages = this.messages.filter(m => m.id !== id);
              this.notifyMessages();
            }
          }
        })
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'message_hides' },
        (payload) => {
          const row = payload.old as DbHide;
          if (row.user_id === this.currentUserId) {
            const id = sid(row.message_id);
            if (this.hiddenIds.delete(id)) {
              // optionally re-fetch that single message if needed
            }
          }
        })
      .subscribe();

    // 5) realtime: typing via broadcast (tanpa menyentuh DB)
    this.subTyping?.unsubscribe();
    this.subTyping = supabase
      .channel(`typing:${this.room}`, { config: { broadcast: { ack: false } } })
      .on('broadcast', { event: 'typing' }, (payload) => {
        const { action, userId, username } = payload.payload as { action: 'start' | 'stop', userId: string, username: string };
        if (!userId || userId === this.currentUserId) return;
        if (action === 'start') {
          this.applyTyping(userId, username);
        } else {
          this.clearTyping(userId);
        }
      })
      .subscribe();
  }

  /** Mapping DB → UI Message */
  private mapDbToMessage = (row: DbMessage): Message => {
    const id = sid(row.id);
    const isDeletedForAll = !!row.deleted_for_all;
    const isImage = row.type === 'image' && row.attachment_url;

    return {
      id,
      userId: row.user_id ?? '',
      username: row.username ?? 'User',
      content: isDeletedForAll ? 'This message was deleted.' : (row.content ?? ''),
      timestamp: new Date(row.created_at),
      fileUrl: isDeletedForAll ? undefined : (isImage ? row.attachment_url! : undefined),
      fileName: undefined,
      fileType: isDeletedForAll ? undefined : (isImage ? 'image/*' : undefined),
      deletedFor: [], // sisi UI; hide asli disimpan di message_hides
    };
  };

  /** ====== Public API untuk UI ====== */

  // Subscribe ke daftar pesan
  onMessagesUpdate(callback: (messages: Message[]) => void) {
    this.msgListeners.add(callback);
    callback([...this.messages]);
    return () => this.msgListeners.delete(callback);
  }

  // Subscribe ke typing users
  onTypingUpdate(callback: (users: TypingUser[]) => void) {
    this.typingListeners.add(callback);
    callback(this.getTypingList());
    return () => this.typingListeners.delete(callback);
  }

  // Kirim pesan teks
  async sendMessage(userId: string, username: string, content: string) {
    if (!content.trim()) return;
    await supabase.from('messages').insert({
      room: this.room,
      type: 'text',
      content,
      attachment_url: null,
      user_id: userId,
      username,
      avatar_url: null,
    });
    // Realtime akan mengalirkan pesan; tidak perlu append manual.
    // Hentikan typing user ini
    await this.stopTyping(userId);
  }

  // Kirim pesan gambar (upload ke bucket lalu kirim pesan type=image)
  async sendFileMessage(userId: string, username: string, file: File) {
    if (!file || !file.type.startsWith('image/')) {
      throw new Error('Hanya gambar yang didukung.');
    }

    const ext = file.name.split('.').pop() || 'png';
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { data, error } = await supabase
      .storage.from('chat-images')
      .upload(filename, file, { upsert: false });
    if (error) throw error;

    const { data: pub } = supabase.storage.from('chat-images').getPublicUrl(data.path);
    const publicUrl = pub.publicUrl;

    await supabase.from('messages').insert({
      room: this.room,
      type: 'image',
      content: null,
      attachment_url: publicUrl,
      user_id: userId,
      username,
      avatar_url: null,
    });
  }

  // Hapus pesan
  async deleteMessage(messageId: string, userId: string, deleteForEveryone = false) {
    if (!messageId) return;

    if (deleteForEveryone) {
      // hanya pemilik pesan yang boleh
      // (RLS policy di DB juga membatasi update oleh author saja)
      const idNum = Number.isNaN(Number(messageId)) ? messageId : Number(messageId);
      await supabase
        .from('messages')
        .update({ deleted_for_all: true, content: null, attachment_url: null })
        .eq('id', idNum);
    } else {
      // delete for me → insert ke message_hides
      const idNum = Number.isNaN(Number(messageId)) ? messageId : Number(messageId);
      await supabase
        .from('message_hides')
        .insert({ user_id: userId, message_id: idNum });
      // local immediate hide
      this.hiddenIds.add(String(messageId));
      this.messages = this.messages.filter(m => m.id !== String(messageId));
      this.notifyMessages();
    }
  }

  // Hapus seluruh riwayat (untuk diri sendiri)
  async clearAllMessages(userId: string) {
    // ambil id pesan yang belum ter-hide
    const ids = this.messages.map(m => m.id).filter(id => !this.hiddenIds.has(id));
    if (ids.length === 0) return;

    // Insert bulk ke message_hides (batasi chunk untuk aman)
    const chunks: string[][] = [];
    const size = 100;
    for (let i = 0; i < ids.length; i += size) chunks.push(ids.slice(i, i + size));

    for (const ck of chunks) {
      const rows = ck.map(id => ({
        user_id: userId,
        message_id: Number.isNaN(Number(id)) ? id : Number(id),
      }));
      await supabase.from('message_hides').insert(rows);
      ck.forEach(id => this.hiddenIds.add(String(id)));
    }

    this.messages = this.messages.filter(m => !this.hiddenIds.has(m.id));
    this.notifyMessages();
  }

  // Start typing (broadcast; timeout 3 detik di sisi peer)
  async startTyping(userId: string, username: string) {
    // local state supaya UI responsif
    this.applyTyping(userId, username);
    // broadcast ke channel
    await supabase.channel(`typing:${this.room}`).send({
      type: 'broadcast',
      event: 'typing',
      payload: { action: 'start', userId, username },
    });
  }

  // Stop typing
  async stopTyping(userId: string) {
    this.clearTyping(userId);
    await supabase.channel(`typing:${this.room}`).send({
      type: 'broadcast',
      event: 'typing',
      payload: { action: 'stop', userId },
    });
  }

  /** ====== Internal helpers ====== */

  private notifyMessages() {
    const snapshot = [...this.messages];
    this.msgListeners.forEach(cb => cb(snapshot));
  }

  private getTypingList(): TypingUser[] {
    return Array.from(this.typingUsers.entries()).map(([userId, v]) => ({
      userId,
      username: v.username || 'Someone',
    }));
  }

  private notifyTyping() {
    const list = this.getTypingList();
    this.typingListeners.forEach(cb => cb(list));
  }

  private applyTyping(userId: string, username: string) {
    const entry = this.typingUsers.get(userId);
    if (entry?.timeout) clearTimeout(entry.timeout);

    const timeout = setTimeout(() => {
      this.typingUsers.delete(userId);
      this.notifyTyping();
    }, 3000);

    this.typingUsers.set(userId, { username, timeout });
    this.notifyTyping();
  }

  private clearTyping(userId: string) {
    const entry = this.typingUsers.get(userId);
    if (entry?.timeout) clearTimeout(entry.timeout);
    this.typingUsers.delete(userId);
    this.notifyTyping();
  }

  /** Pembersihan (mis. saat unmount) */
  dispose() {
    this.subMessages?.unsubscribe();
    this.subHides?.unsubscribe();
    this.subTyping?.unsubscribe();
    this.msgListeners.clear();
    this.typingListeners.clear();
    this.typingUsers.clear();
  }
}

/** Singleton */
export const chatService = new ChatService();
