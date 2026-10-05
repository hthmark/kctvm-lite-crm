# Quo sending and CRM conversation sync

This change is inactive until `SMS_PROVIDER=quo`. Merely adding the Quo API key does not switch sending. All existing SMS callers use the same provider setting, including calculator confirmations, Facebook openers, legacy inbound/missed-call replies, follow-ups, owner alerts, and dashboard sends.

## Configuration

- `QUO_API_KEY`: server-side Quo API credential.
- `QUO_PHONE_NUMBER_ID`: Quo inbox ID. The existing Railway variable `QUO_PHONE_NUMBER` is supported as an alternative and accepts either a PN ID or an E.164 number. If both are set, the ID takes precedence.
- `QUO_WEBHOOK_SECRET`: signing key returned by the versioned Quo webhook API, including `whsec_`.
- `SMS_PROVIDER`: `telnyx` (default) or `quo`.
- `OWNER_ALERT_PHONE`: owner notification recipient; must be different from the Quo sending number.

For the reviewed KCTVM account, the inbox ID is `PNrJDIhRXH`. Do not put API keys or webhook secrets in GitHub, browser code, or a PR description.

## Activation order

1. Deploy this code while keeping `SMS_PROVIDER=telnyx` (or unset).
2. Create a **versioned API webhook**, not a legacy webhook in Quo's UI. First list existing webhooks to avoid duplicates: `GET https://api.quo.com/webhooks`, with `Authorization: <QUO_API_KEY>` and `Quo-Api-Version: 2026-03-30`.
3. If no matching endpoint exists, make `POST https://api.quo.com/webhooks` with those headers plus `Content-Type: application/json`, and this body:

   ```json
   {
     "events": ["message.received", "message.delivered"],
     "url": "https://kctvm-lite-crm-production.up.railway.app/webhook/quo-messages",
     "resourceIds": ["PNrJDIhRXH"],
     "status": "disabled",
     "label": "kctvm-crm-message-sync"
   }
   ```

4. Save the response's `data.key` as Railway's `QUO_WEBHOOK_SECRET`; retain the webhook ID. Deploy that variable, then enable the webhook with `PATCH https://api.quo.com/webhooks/<id>` and `{"status":"enabled"}` using the same API headers. Do not create duplicates or rotate an existing secret blindly.
5. Verify a controlled inbound message from an existing test lead appears once in the CRM, and a response sent in the Quo app appears after its delivered event. Use only an explicitly approved test recipient. Confirm Quo API messaging registration/credits and verify `OWNER_ALERT_PHONE` is not the sending number.
6. Set `SMS_PROVIDER=quo` and deploy. Test a new test lead's calculator confirmation, then reply and verify sync. The existing-number rule still suppresses a second automatic quote confirmation, so use a genuinely new approved test number when testing that path.
7. Keep Telnyx credentials for rollback. Returning `SMS_PROVIDER=telnyx` changes outbound sending back; the Quo sync webhook is independently enabled/disabled.

## Sync behavior and scope

- `POST /webhook/quo-messages` verifies the signature over the raw bytes before parsing; stale, tampered, and unsigned requests are rejected. Missing signing configuration returns 503.
- Only the configured inbox and one-to-one messages are handled. Owner notification conversations are excluded.
- Received messages and delivered outbound messages from the Quo app sync to **existing CRM leads matched by phone**. Unknown Quo contacts are not imported and Quo inbound messages do not trigger a new AI reply. The website/form workflow already creates its lead before sending.
- Incoming events refresh last inbound time and clear follow-up only when newer than the saved timestamp. Delayed/repeated events cannot move it backward.
- A deterministic UUID derived from the Quo message ID is used as the existing `messages.id`. Database upsert on this primary key prevents duplication when send responses and delivery webhooks race or are retried. No schema migration or history rewrite is required.
- API acceptance is not delivery confirmation. Automated sends are logged when Quo accepts them; outgoing messages composed in Quo sync on delivery. Failed/undelivered events and delivery-status UI are not implemented in this change.
- Attachments are represented by a “view in Quo” note; media files are not copied. Old conversations are not backfilled.
- The existing three-hour follow-up rules remain. An outbound reply from Quo does not change lead status or reset the inbound clock; move a lead out of `Lead` when its automatic follow-up is no longer appropriate.
- The old Telnyx inbound/missed-call endpoints remain as transition support. Quo call/missed-call automation is a separate integration; this webhook subscribes to messages only.
- Existing public dashboard/API access concerns are unchanged by this provider migration.

## Tests

`npm ci --ignore-scripts` followed by `npm test`. Tests mock all external sending and storage; the HTTP test binds only to localhost. No real messages, API calls, or database writes are needed. A production smoke test remains necessary after configuration.

## API references

- [Send a message](https://www.quo.com/docs/mdx/api-reference/messages/send-a-text-message)
- [Create versioned webhook](https://www.quo.com/docs/2026-03-30/webhooks/create-a-new-webhook)
- [Webhook event payloads](https://www.quo.com/docs/2026-03-30/webhooks-event-payloads)
- [Signature verification](https://www.quo.com/docs/2026-03-30/webhooks-signature-validation)
