"use client"

import type React from "react"
import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/hooks/use-auth"
import { chatService, type Message } from "@/lib/chat"
import { TypingIndicator } from "@/components/typing-indicator"
import { Send, Hash, Users, Paperclip, Download, Trash2, LogOut } from "lucide-react"

export function ChatRoom() {
  const { user, logout } = useAuth()
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState("")
  const [typingUsers, setTypingUsers] = useState<Array<{ userId: string; username: string }>>([])
  const [isTyping, setIsTyping] = useState(false)
  const [isClearing, setIsClearing] = useState(false)

  const endRef = useRef<HTMLDivElement>(null)
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // init + subscribe
  useEffect(() => {
    if (!user?.id) return
    ;(async () => {
      try { await chatService.init(user.id) } catch (e) { console.error(e) }
    })()

    const offMsgs = chatService.onMessagesUpdate((next) => {
      setMessages((prev) => {
        const seen = new Set<string>()
        const merged: Message[] = []
        for (const m of [...prev, ...next]) {
          const id = String(m.id)
          if (seen.has(id)) continue
          seen.add(id)
          merged.push({ ...m, timestamp: m.timestamp instanceof Date ? m.timestamp : new Date(m.timestamp) })
        }
        return merged
      })
      requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: "auto", block: "end" }))
    })

    const offTyping = chatService.onTypingUpdate((users) =>
      setTypingUsers(users.filter((u) => u.userId !== user.id)),
    )

    return () => {
      offMsgs()
      offTyping()
      chatService.dispose()
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    }
  }, [user?.id])

  // optimistic helper
  const appendOptimistic = (base: Partial<Message>) => {
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const optimistic: Message = {
      id: tempId,
      userId: user!.id,
      username: user!.username || user!.email || "User",
      content: base.content ?? "",
      timestamp: new Date(),
      fileUrl: base.fileUrl,
      fileName: base.fileName,
      fileType: base.fileType,
      deletedFor: [],
    }
    setMessages((p) => [...p, optimistic])
    requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: "auto", block: "end" }))
    return tempId
  }

  // handlers
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setNewMessage(value)
    if (!user) return
    if (value.trim() && !isTyping) {
      setIsTyping(true)
      chatService.startTyping(user.id, user.username || user.email || "User")
    }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = setTimeout(() => {
      chatService.stopTyping(user.id)
      setIsTyping(false)
    }, 1000)
  }

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMessage.trim() || !user) return
    const content = newMessage.trim()
    setNewMessage("")
    appendOptimistic({ content })
    try { await chatService.sendMessage(user.id, user.username || user.email || "User", content) }
    catch (err) { console.error(err) }
    finally {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
      setIsTyping(false)
      chatService.stopTyping(user.id).catch(() => {})
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return
    e.target.value = ""
    const tempId = appendOptimistic({
      content: "",
      fileUrl: URL.createObjectURL(file),
      fileName: file.name,
      fileType: file.type,
    })
    try { await chatService.sendFileMessage(user.id, user.username || user.email || "User", file) }
    catch (err) {
      console.error(err)
      setMessages((prev) => prev.filter((m) => m.id !== tempId))
    }
  }

  const handleDeleteMessage = (messageId: string, forAll = false) => {
    if (!user) return
    chatService.deleteMessage(messageId, user.id, forAll)
  }

  /** 🔒 Clear All untuk DIRI SENDIRI saja (insert ke message_hides) */
  const handleClearAllForMe = async () => {
    if (!user || isClearing) return
    setIsClearing(true)
    try {
      await chatService.clearAllMessages(user.id) // hanya hide utk user ini (tidak menghapus di orang lain)
      setMessages([]) // kosongkan tampilan lokal user ini
    } catch (e) {
      console.error(e)
    } finally {
      setIsClearing(false)
    }
  }

  // helpers ui
  const getUserInitials = (username: string) =>
    username.split(" ").map((w) => w.charAt(0).toUpperCase()).slice(0, 2).join("")

  const formatTime = (date: Date) =>
    date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })

  const formatDate = (date: Date) => {
    const today = new Date()
    const d = new Date(date)
    if (d.toDateString() === today.toDateString()) return "Today"
    const y = new Date(today); y.setDate(y.getDate() - 1)
    if (d.toDateString() === y.toDateString()) return "Yesterday"
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  }

  const grouped = useMemo(() => {
    const map: Record<string, Message[]> = {}
    for (const m of messages) {
      const key = (m.timestamp instanceof Date ? m.timestamp : new Date(m.timestamp)).toDateString()
      ;(map[key] ||= []).push({ ...m, timestamp: m.timestamp instanceof Date ? m.timestamp : new Date(m.timestamp) })
    }
    return map
  }, [messages])

  return (
  <div className="h-screen w-full bg-background text-foreground flex">
    {/* SIDEBAR kiri hanya muncul di desktop */}
    <aside className="hidden md:flex md:flex-col md:w-56 border-r border-border bg-card/60 backdrop-blur">
      <div className="h-12 border-b border-border flex items-center px-3">
        <Hash className="h-4 w-4 text-muted-foreground mr-2" />
        <span className="text-sm font-semibold">general</span>
      </div>

      <div className="p-3 space-y-2">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start"
          onClick={handleClearAllForMe}
          disabled={isClearing || messages.length === 0}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          {isClearing ? "Clearing…" : "Clear All"}
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          onClick={logout}
        >
          <LogOut className="h-4 w-4 mr-2" />
          Logout
        </Button>
      </div>
    </aside>

    {/* MAIN CONTENT selalu full di mobile */}
    <div className="flex-1 flex flex-col h-full">
        {/* HEADER ringan */}
        <header className="sticky top-0 z-20 h-12 w-full border-b border-border bg-background/80 backdrop-blur">
          <div className="mx-auto flex h-full max-w-screen-2xl items-center justify-between px-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold"># general</span>
            </div>
            <div className="hidden md:flex items-center space-x-1 text-xs text-muted-foreground">
              <Users className="h-3 w-3" />
              <span>
                {messages.filter((m, i, arr) => arr.findIndex((x) => x.userId === m.userId) === i).length} online
              </span>
            </div>
          </div>
        </header>

        {/* LIST PESAN */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {Object.entries(grouped).map(([dateKey, dayMessages]) => (
            <div key={dateKey} className="fade-in">
              <div className="flex items-center justify-center py-4">
                <div className="bg-muted px-3 py-1 rounded-full text-xs text-muted-foreground">
                  {formatDate(new Date(dateKey))}
                </div>
              </div>

              <div className="px-3 md:px-4 space-y-2 md:space-y-4">
                {dayMessages.map((message, index) => {
                  const prev = dayMessages[index - 1]
                  const isConsecutive =
                    prev &&
                    prev.userId === message.userId &&
                    message.timestamp.getTime() - prev.timestamp.getTime() < 300000

                  return (
                    <div
                      key={message.id}
                      className={`flex items-start space-x-2 md:space-x-3 message-hover p-2 rounded-lg transition-all duration-200 message-enter group ${
                        isConsecutive ? "mt-1" : "mt-4"
                      }`}
                    >
                      {!isConsecutive ? (
                        <div className="h-6 w-6 md:h-8 md:w-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs md:text-sm font-medium text-primary">
                            {getUserInitials(message.username)}
                          </span>
                        </div>
                      ) : (
                        <div className="w-6 md:w-8 flex-shrink-0" />
                      )}

                      <div className="flex-1 min-w-0">
                        {!isConsecutive && (
                          <div className="flex items-baseline space-x-2">
                            <span className="font-medium text-foreground text-sm md:text-base">{message.username}</span>
                            <span className="text-xs text-muted-foreground">
                              {formatTime(message.timestamp)}
                            </span>
                          </div>
                        )}

                        {message.fileUrl ? (
                          <div className="mt-1">
                            {message.fileType?.startsWith("image/") ? (
                              <div className="relative">
                                <img
                                  src={message.fileUrl || "/placeholder.svg"}
                                  alt={message.fileName}
                                  className="max-w-xs rounded-lg cursor-pointer"
                                  onClick={() => window.open(message.fileUrl!, "_blank")}
                                />
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={() => {
                                    const a = document.createElement("a")
                                    a.href = message.fileUrl!
                                    a.download = message.fileName || "image"
                                    a.click()
                                  }}
                                >
                                  <Download className="h-3 w-3" />
                                </Button>
                              </div>
                            ) : (
                              <div className="flex items-center space-x-2 bg-muted p-2 rounded-lg max-w-xs">
                                <span className="text-sm truncate">{message.fileName}</span>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    const a = document.createElement("a")
                                    a.href = message.fileUrl!
                                    a.download = message.fileName || "file"
                                    a.click()
                                  }}
                                >
                                  <Download className="h-3 w-3" />
                                </Button>
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className={`text-foreground break-words text-sm md:text-base ${isConsecutive ? "mt-0" : "mt-1"}`}>
                            {message.content}
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          <TypingIndicator users={typingUsers} />
          <div ref={endRef} />
        </div>

        {/* INPUT */}
        <form onSubmit={handleSendMessage} className="p-3 md:p-4 border-t border-border">
          <div className="flex space-x-2">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileUpload}
              accept="image/*,.pdf,.doc,.docx,.txt"
            />
            <Button type="button" variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()} className="px-3">
              <Paperclip className="h-4 w-4" />
            </Button>

            <Input
              value={newMessage}
              onChange={handleInputChange}
              placeholder="Message #general"
              className="flex-1 bg-input border-border text-foreground placeholder:text-muted-foreground text-sm md:text-base transition-all duration-200 focus:ring-2 focus:ring-primary/50"
              maxLength={2000}
            />
            <Button
              type="submit"
              disabled={!newMessage.trim()}
              className="bg-primary hover:bg-primary/90 text-primary-foreground btn-hover-scale transition-all duration-200 px-3 md:px-4"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
