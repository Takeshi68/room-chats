"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useAuth } from "@/hooks/use-auth"
import { MessageCircle } from "lucide-react"export function AuthForm() {
  const [error, setError] = useState("")

  const { loginWithGithub, isLoading } = useAuth()
  const [username, setUsername] = useState("")
  const disableGithub = process.env.NEXT_PUBLIC_DISABLE_GITHUB === 'true' || process.env.NEXT_PUBLIC_DISABLE_SUPABASE === 'true'

  const handleGithubLogin = async () => {
    setError("")
    try {
      await loginWithGithub()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed")
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background grid-bg p-4">
      <div className="w-full max-w-md">
        <Card className="glass-effect border-border/50 fade-in">
          <CardHeader className="text-center space-y-4">
            <div className="flex items-center justify-center space-x-2 bounce-in">
              <MessageCircle className="h-8 w-8 text-primary" />
              <h1 className="text-2xl font-bold text-foreground">ChatApp</h1>
            </div>
            <CardTitle className="text-xl text-foreground">Welcome!</CardTitle>
            <CardDescription className="text-muted-foreground">Sign in to start chatting</CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {error && <div className="text-destructive text-sm text-center slide-up">{error}</div>}

            
            {disableGithub ? (
              <div className="space-y-3">
                <input
                  value={username}
                  onChange={e=>setUsername(e.target.value)}
                  placeholder="Enter a display name..."
                  className="w-full rounded-md border px-3 py-2 bg-background"
                />
                <Button onClick={()=>loginWithGithub(username)} className="w-full">
                  Continue as Guest
                </Button>
              </div>
            ) : (
              <Button onClick={handleGithubLogin} className="w-full">
                Continue with GitHub
              </Button>
            )}
    
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
