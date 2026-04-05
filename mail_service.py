from googleapiclient.discovery import build
from auth import get_credentials
import base64
from email.mime.text import MIMEText

DISCLAIMER = (
    "\n\n---\n"
    "⚠️ This message was sent by an experimental AI email assistant. "
    "It operates autonomously and may make errors. "
    "Please contact the organiser directly if you have concerns."
)

def get_gmail_service():
    creds = get_credentials()
    return build('gmail', 'v1', credentials=creds)

def get_unread_emails(service, max_results=10):
    result = service.users().messages().list(
        userId='me',
        labelIds=['INBOX', 'UNREAD'],
        maxResults=max_results
    ).execute()

    messages = result.get('messages', [])
    emails = []

    for msg in messages:
        full_msg = service.users().messages().get(
            userId='me',
            id=msg['id'],
            format='full'
        ).execute()
        emails.append(parse_email(full_msg))

    return emails

def parse_email(msg):
    headers = msg['payload']['headers']

    def get_header(name):
        for h in headers:
            if h['name'].lower() == name.lower():
                return h['value']
        return ''

    body = ''
    payload = msg['payload']

    if 'parts' in payload:
        for part in payload['parts']:
            if part['mimeType'] == 'text/plain':
                data = part['body'].get('data', '')
                body = base64.urlsafe_b64decode(data).decode('utf-8', errors='ignore')
                break
    elif 'body' in payload:
        data = payload['body'].get('data', '')
        if data:
            body = base64.urlsafe_b64decode(data).decode('utf-8', errors='ignore')

    return {
        'id': msg['id'],
        'thread_id': msg.get('threadId', ''),
        'sender': get_header('From'),
        'to': get_header('To'),
        'subject': get_header('Subject'),
        'body': body.strip(),
        'snippet': msg.get('snippet', '')
    }

def get_thread_messages(service, thread_id):
    thread = service.users().threads().get(
        userId='me',
        id=thread_id,
        format='full'
    ).execute()
    return [parse_email(msg) for msg in thread.get('messages', [])]

def send_reply(service, original_email, body_text):
    reply_body = body_text + DISCLAIMER
    message = MIMEText(reply_body)
    message['To'] = original_email['sender']
    message['From'] = 'me'
    message['Subject'] = 'Re: ' + original_email['subject']
    message['In-Reply-To'] = original_email['id']
    message['References'] = original_email['id']

    raw = base64.urlsafe_b64encode(message.as_bytes()).decode()

    sent = service.users().messages().send(
        userId='me',
        body={'raw': raw, 'threadId': original_email['thread_id']}
    ).execute()

    print(f"Reply sent. Message ID: {sent['id']}")
    return sent['id']

def mark_as_read(service, message_id):
    service.users().messages().modify(
        userId='me',
        id=message_id,
        body={'removeLabelIds': ['UNREAD']}
    ).execute()