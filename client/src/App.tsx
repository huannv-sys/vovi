import { Route, Switch } from "wouter";
import Dashboard from "@/pages/dashboard";
import Devices from "@/pages/devices";
import Alerts from "@/pages/alerts";
import NotFound from "@/pages/not-found";
import AppLayout from "@/components/layout/AppLayout";

function App() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/devices" component={Devices} />
        <Route path="/alerts" component={Alerts} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

export default App;
