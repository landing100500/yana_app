import AppSetting from '@/models/AppSetting';

export const MAIL_FOOTER_SETTING_KEY = 'mail_footer_html';

export const DEFAULT_MAIL_FOOTER_HTML = `
<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e0e0e0;font-size:12px;color:#888;text-align:center;">
  <p>Вы получили это письмо, потому что зарегистрированы в сервисе ЯСНА.</p>
  <p><a href="{{unsubscribe_url}}" style="color:#888;">Отписаться от рассылки</a></p>
  <p>© ЯСНА</p>
</div>
`.trim();

export async function getMailFooterHtml(): Promise<string> {
  const row = await AppSetting.findByPk(MAIL_FOOTER_SETTING_KEY);
  return row?.value?.trim() || DEFAULT_MAIL_FOOTER_HTML;
}

export async function setMailFooterHtml(html: string): Promise<void> {
  await AppSetting.upsert({
    key: MAIL_FOOTER_SETTING_KEY,
    value: html,
  });
}

export function wrapEmailBody(bodyHtml: string, footerHtml: string, unsubscribeUrl: string): string {
  const footer = footerHtml.replace(/\{\{unsubscribe_url\}\}/g, unsubscribeUrl);
  return `
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f5f5;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;padding:32px 24px;">
          <tr>
            <td style="color:#333333;font-size:16px;line-height:1.6;">
              ${bodyHtml}
              ${footer}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`.trim();
}
