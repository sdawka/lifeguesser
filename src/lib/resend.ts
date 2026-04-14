type Locals = App.Locals;

type SendEmailParams = {
  to: string;
  subject: string;
  html: string;
};

export async function sendEmail(
  locals: Locals,
  params: SendEmailParams
): Promise<{ success: boolean; error?: string }> {
  const apiKey = locals.runtime?.env?.RESEND_API_KEY;
  const fromEmail = locals.runtime?.env?.RESEND_FROM_EMAIL ?? 'noreply@sahil.pro';

  if (!apiKey) {
    console.error('RESEND_API_KEY not configured');
    return { success: false, error: 'Email service not configured' };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: params.to,
        subject: params.subject,
        html: params.html,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Resend error:', err);
      return { success: false, error: 'Failed to send email' };
    }

    return { success: true };
  } catch (err: any) {
    console.error('Resend error:', err);
    return { success: false, error: err?.message ?? 'Failed to send email' };
  }
}
