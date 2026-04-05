from mail_service import get_gmail_service, get_unread_emails, send_reply, mark_as_read

service = get_gmail_service()
emails = get_unread_emails(service)
print(f"Found {len(emails)} unread emails")

for e in emails:
    print(f"\nFrom: {e['sender']}")
    print(f"Subject: {e['subject']}")
    print(f"Body preview: {e['body'][:200]}")
    send_reply(service, e, "Hi, I received your email and I am checking availability.")
    try:
        mark_as_read(service, e['id'])
        print("Marked as read.")
    except Exception as ex:
        print(f"Could not mark as read: {ex}")
    print("Done.")