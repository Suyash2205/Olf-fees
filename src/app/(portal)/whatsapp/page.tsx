import WhatsAppClient from "./WhatsAppClient";

export default function WhatsAppPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="portal-title">WhatsApp parents</h1>
        <p className="text-sm text-slate-500 mt-1">
          Parents get a WhatsApp message when their child is absent and are asked for the reason. After two messages
          with no reply, the bot stops messaging them and they show here as Not replying. Any reply clears it.
        </p>
      </div>
      <WhatsAppClient />
    </div>
  );
}
