import { ConnectionForm } from "@/components/connections/connection-form";

export default function ConnectionsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold mb-6">Connection Settings</h1>
      <ConnectionForm />
    </div>
  );
}
