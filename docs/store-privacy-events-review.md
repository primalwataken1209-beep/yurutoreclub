# Store privacy alignment — review draft

Base: c673cb92bdf0abbab460eeec5848c9921cd99cf1. No production change or store submission.

## Confirmed event correction
app.js trackEvent sends app_open, panda_room_open, panda_tap, exercise_recorded and mission_completed only for a signed-in session.
supabase_v28_events.sql associates each event with auth.uid() and a timestamp; comments describe administrator aggregate analysis.
Declare Product Interaction as linked, not tracking, purpose Analytics. User ID has both existing App Functionality and Analytics purposes.
This changes declarations only, not collection behavior. Remaining manifest categories are not certified complete by this patch.

## Google Play working inventory (not final form answers)
| Data | Evidence | Candidate classification / purpose |
| --- | --- | --- |
| Signed-in activity records, notes, progress | app.js saveSt -> syncStateToSupabase -> user_progress | Fitness info / app functionality; notes may also be other user-generated content |
| Five usage events | app.js trackEvent; supabase_v28_events.sql | App interactions / analytics |
| Account identifier on events | auth.uid() default in SQL | User IDs / analytics and account management |
| Photos attached to exercise records | ytStripLocalPhotos strips contents before state sync | Contents remain local in this path; dimensions and localOnly marker are sent |
| Community posts and selected uploaded images | Existing social feature; full path audit pending | User-generated content and photos; review optional collection and user-initiated sharing |
| Profile nickname, region, email | Full current input/persistence audit pending | Review name, approximate location, email and user ID separately |

Do not select “no data collected”. Local-only photo handling does not apply to photos explicitly uploaded to the community.
Do not infer that data is unlinked because the client omits a user_id field: the SQL default supplies it.
Required/optional collection, sharing exemptions, SDK/server logs, deletion coverage and all transfer encryption require final validation against the actual release artifact.
A trial mode alone is not evidence that every data field is optional for every user.

## Next executable work
1. Check profile fields and social upload paths on this exact source version; complete the inventory.
2. Verify deletion covers user_progress, app_events, social content and uploaded files on staging using disposable accounts only. Do not remove private production images.
3. Align App Store Connect privacy answers and Google Play Data safety with the completed inventory.
4. Review docs/privacy-alignment-draft.md for the public policy amendment; production deployment remains a separate approval gate.
5. Run normal PR checks and the iOS compile validation. A new archive after merging is needed to include this manifest change; uploaded build 1.0(1) is unchanged.
6. Keep iPhone runtime testing pending, not passed.

## Focused validation
XML parsed successfully; six collected data types, exactly one ProductInteraction, Linked=true and Tracking=false.
Review purpose classification against the actual event aggregation behavior.
No runtime code, SQL, authentication, storage policies, signing configuration or workflow changes.

## Sources
https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacycollecteddatatypes/nsprivacycollecteddatatype
https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacycollecteddatatypes/nsprivacycollecteddatatypepurposes
https://support.google.com/googleplay/android-developer/answer/10787469?hl=en
