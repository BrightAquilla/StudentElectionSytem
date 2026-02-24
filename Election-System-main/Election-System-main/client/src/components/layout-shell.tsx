import React from "react";
import { useAuth } from "@/hooks/use-auth";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { 
  LogOut, 
  LayoutDashboard, 
  Vote, 
  PlusCircle, 
  User, 
  Menu,
  BarChart3,
  Users,
  ListChecks,
  Trophy
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [location] = useLocation();

  const isAdmin = user?.isAdmin;

  if (!user) return <>{children}</>;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b bg-card/50 backdrop-blur-md sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href={isAdmin ? "/admin/dashboard" : "/dashboard"} className="flex items-center gap-2 font-display text-2xl font-bold text-primary hover:opacity-80 transition-opacity">
            <Vote className="h-8 w-8" />
            <span>Votely</span>
          </Link>

          <nav className="flex items-center gap-6">
            <Link href={isAdmin ? "/admin/dashboard" : "/dashboard"} className={`text-sm font-medium transition-colors hover:text-primary ${location.includes("dashboard") ? "text-primary" : "text-muted-foreground"}`}>
              Dashboard
            </Link>
            {isAdmin && (
              <Link href="/admin/create-election" className={`text-sm font-medium transition-colors hover:text-primary ${location === "/admin/create-election" ? "text-primary" : "text-muted-foreground"}`}>
                Create Election
              </Link>
            )}
            {isAdmin && (
              <Link href="/admin/analytics" className={`text-sm font-medium transition-colors hover:text-primary ${location === "/admin/analytics" ? "text-primary" : "text-muted-foreground"}`}>
                Analytics
              </Link>
            )}
            {!isAdmin && (
              <>
                <Link href="/elections" className={`text-sm font-medium transition-colors hover:text-primary ${location === "/elections" ? "text-primary" : "text-muted-foreground"}`}>
                  Elections
                </Link>
                <Link href="/my-votes" className={`text-sm font-medium transition-colors hover:text-primary ${location === "/my-votes" ? "text-primary" : "text-muted-foreground"}`}>
                  My Votes
                </Link>
              </>
            )}
          </nav>

          <div className="flex items-center gap-4">
            <div className="hidden md:flex flex-col items-end">
              <span className="text-sm font-medium">{user.name}</span>
              <span className="text-xs text-muted-foreground uppercase tracking-wider">{isAdmin ? "Admin" : "Voter"}</span>
            </div>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full">
                  <User className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium leading-none">{user.name}</span>
                    <span className="text-xs text-muted-foreground uppercase tracking-wider">{isAdmin ? "Admin" : "Voter"}</span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {isAdmin ? (
                  <>
                    <Link href="/admin/dashboard">
                      <DropdownMenuItem className="cursor-pointer">
                        <LayoutDashboard className="mr-2 h-4 w-4" />
                        <span>Manage Elections</span>
                      </DropdownMenuItem>
                    </Link>
                    <Link href="/admin/candidates">
                      <DropdownMenuItem className="cursor-pointer">
                        <Users className="mr-2 h-4 w-4" />
                        <span>Manage Candidates</span>
                      </DropdownMenuItem>
                    </Link>
                    <Link href="/admin/voters">
                      <DropdownMenuItem className="cursor-pointer">
                        <User className="mr-2 h-4 w-4" />
                        <span>Manage Voters</span>
                      </DropdownMenuItem>
                    </Link>
                    <Link href="/admin/analytics">
                      <DropdownMenuItem className="cursor-pointer">
                        <BarChart3 className="mr-2 h-4 w-4" />
                        <span>Analytics</span>
                      </DropdownMenuItem>
                    </Link>
                    <DropdownMenuSeparator />
                  </>
                ) : (
                  <>
                    <Link href="/dashboard">
                      <DropdownMenuItem className="cursor-pointer">
                        <LayoutDashboard className="mr-2 h-4 w-4" />
                        <span>My Dashboard</span>
                      </DropdownMenuItem>
                    </Link>
                    <Link href="/elections">
                      <DropdownMenuItem className="cursor-pointer">
                        <ListChecks className="mr-2 h-4 w-4" />
                        <span>Elections</span>
                      </DropdownMenuItem>
                    </Link>
                    <Link href="/my-votes">
                      <DropdownMenuItem className="cursor-pointer">
                        <Vote className="mr-2 h-4 w-4" />
                        <span>My Votes</span>
                      </DropdownMenuItem>
                    </Link>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem onClick={() => logout()} className="text-destructive cursor-pointer">
                  <LogOut className="mr-2 h-4 w-4" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
      <main className="flex-1 container mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  );
}
