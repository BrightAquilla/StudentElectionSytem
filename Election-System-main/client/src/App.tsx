import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LayoutShell } from "@/components/layout-shell";
import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";

import LoginPage from "@/pages/login-page";
import RegisterPage from "@/pages/register-page";
import Dashboard from "@/pages/dashboard";
import ElectionDetail from "@/pages/election-detail";
import ElectionResults from "@/pages/election-results";
import ElectionsPage from "@/pages/elections";
import MyVotes from "@/pages/my-votes";
import ApplyCandidate from "@/pages/apply-candidate";
import AdminDashboard from "@/pages/admin-dashboard";
import AdminElections from "@/pages/admin-election-detail";
import AdminCandidates from "@/pages/admin-candidates";
import AdminElectionDetail from "@/pages/admin-election-detail";
import CreateElection from "@/pages/create-election";
import AdminAnalytics from "@/pages/admin-analytics";
import AdminAuditLogs from "@/pages/admin-audit-logs";
import AdminStressMonitor from "@/pages/admin-stress-monitor";
import AdminParties from "@/pages/admin-parties";
import AdminVoters from "@/pages/admin-voters";
import AnalyticsDashboard from "@/pages/analytics-dashboard";
import CandidateDashboard from "@/pages/candidate-dashboard";
import ProfilePage from "@/pages/profile-page";
import NotFound from "@/pages/not-found";

function ProtectedRoute({ component: Component, adminOnly = false }: { component: React.ComponentType, adminOnly?: boolean }) {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    setLocation("/login");
    return null;
  }

  if (adminOnly && !user.isAdmin) {
    setLocation("/dashboard");
    return null;
  }

  return <Component />;
}

function Router() {
  return (
    <LayoutShell>
      <Switch>
        <Route path="/login" component={LoginPage} />
        <Route path="/register" component={RegisterPage} />
        
        {/* Voter Routes */}
        <Route path="/dashboard">
          <ProtectedRoute component={Dashboard} />
        </Route>
        <Route path="/elections">
          <ProtectedRoute component={ElectionsPage} />
        </Route>
        <Route path="/elections/:id">
          <ProtectedRoute component={ElectionDetail} />
        </Route>
        <Route path="/elections/:id/results">
          <ProtectedRoute component={ElectionResults} />
        </Route>
        <Route path="/my-votes">
          <ProtectedRoute component={MyVotes} />
        </Route>
        <Route path="/analytics">
          <ProtectedRoute component={AnalyticsDashboard} />
        </Route>
        <Route path="/apply-candidate">
          <ProtectedRoute component={ApplyCandidate} />
        </Route>
        <Route path="/candidate-dashboard">
          <ProtectedRoute component={CandidateDashboard} />
        </Route>
        <Route path="/profile">
          <ProtectedRoute component={ProfilePage} />
        </Route>

        {/* Admin Routes */}
        <Route path="/admin/dashboard">
          <ProtectedRoute component={AdminDashboard} adminOnly />
        </Route>
        <Route path="/admin/elections">
          <ProtectedRoute component={AdminElections} adminOnly />
        </Route>
        <Route path="/admin/candidates">
          <ProtectedRoute component={AdminCandidates} adminOnly />
        </Route>
        <Route path="/admin/voters">
          <ProtectedRoute component={AdminVoters} adminOnly />
        </Route>
        <Route path="/admin/create-election">
          <ProtectedRoute component={CreateElection} adminOnly />
        </Route>
        <Route path="/admin/elections/:id">
          <ProtectedRoute component={AdminElectionDetail} adminOnly />
        </Route>
        <Route path="/admin/analytics">
          <ProtectedRoute component={AdminAnalytics} adminOnly />
        </Route>
        <Route path="/admin/audit-logs">
          <ProtectedRoute component={AdminAuditLogs} adminOnly />
        </Route>
        <Route path="/admin/stress-monitor">
          <ProtectedRoute component={AdminStressMonitor} adminOnly />
        </Route>
        <Route path="/admin/parties">
          <ProtectedRoute component={AdminParties} adminOnly />
        </Route>

        <Route path="/" component={LoginPage} />
        <Route component={NotFound} />
      </Switch>
    </LayoutShell>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
