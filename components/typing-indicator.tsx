"use client"

interface TypingIndicatorProps {
  users: Array<{ userId: string; username: string }>
}

export function TypingIndicator({ users }: TypingIndicatorProps) {
  if (users.length === 0) return null

  const getTypingText = () => {
    if (users.length === 1) {
      return `${users[0].username} is typing...`
    } else if (users.length === 2) {
      return `${users[0].username} and ${users[1].username} are typing...`
    } else {
      return `${users[0].username} and ${users.length - 1} others are typing...`
    }
  }

  return (
    <div className="flex items-center space-x-2 px-3 md:px-4 py-2 text-sm text-muted-foreground fade-in">
      <div className="typing-dots">
        <div className="typing-dot" />
        <div className="typing-dot" />
        <div className="typing-dot" />
      </div>
      <span className="text-xs md:text-sm">{getTypingText()}</span>
    </div>
  )
}
