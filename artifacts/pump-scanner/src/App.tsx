import { Switch, Route, Router as WouterRouter, useLocation, Redirect } from "wouter";
import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SettingsProvider } from "@/contexts/settings-context";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import SettingsPage from "@/pages/settings";
import WelcomePage, { hasSeen } from "@/pages/welcome";
import { ChatPage } from "@/components/ChatPage";
import { getChatData } from "@/lib/chat-store";

const queryClient = new QueryClient();

function ChatRoute({ mint }: { mint: string }) {
  const [, nav] = useLocation();
  const data = getChatData(mint);
  if (!data) return <Redirect to="/" />;
  return (
    <ChatPage
      mint={mint}
      symbol={data.symbol}
      name={data.name}
      creator={data.creator}
      onClose={() => nav("/")}
    />
  );
}

function Router() {
  const [location, nav] = useLocation();

  useEffect(() => {
    if (location === "/" && !hasSeen()) {
      nav("/welcome", { replace: true });
    }
  }, [location, nav]);

  return (
    <Switch>
      <Route path="/welcome" component={WelcomePage} />
      <Route path="/" component={Dashboard} />
      <Route path="/settings" component={SettingsPage} />
      <Route path="/chat/:mint">
        {(params) => <ChatRoute mint={params.mint} />}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SettingsProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </SettingsProvider>
    </QueryClientProvider>
  );
}

export default App;
