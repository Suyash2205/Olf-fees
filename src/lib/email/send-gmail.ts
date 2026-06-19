import nodemailer from "nodemailer";

export function parseRecipientList(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
}

export async function sendGmailMessage(options: {
  to: string[];
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  const user = process.env.GMAIL_USER?.trim();
  const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, "");
  if (!user || !pass) {
    throw new Error("GMAIL_USER and GMAIL_APP_PASSWORD must be configured");
  }
  if (options.to.length === 0) {
    throw new Error("At least one recipient is required");
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });

  await transporter.sendMail({
    from: `Our Lady of Fatima School <${user}>`,
    to: options.to.join(", "),
    subject: options.subject,
    html: options.html,
    text: options.text,
  });
}
