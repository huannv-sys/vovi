import { Route, Switch } from "wouter";
import Dashboard from "@/pages/dashboard";
import Devices from "@/pages/devices";
import Alerts from "@/pages/alerts";
import Network from "@/pages/network";
import Security from "@/pages/security";
import Settings from "@/pages/settings";
import NotFound from "@/pages/not-found";
import AppLayout from "@/components/layout/AppLayout";

function App() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/devices" component={Devices} />
        <Route path="/alerts" component={Alerts} />
        <Route path="/network" component={Network} />
        <Route path="/security" component={Security} />
        <Route path="/settings" component={Settings} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

export default App;
