next actions: 
1. demo video


current issues:
If from the page, when I select the provider, it calls the provider but doesn't update the status or send users the confirmation.

In fact, the request details page shows recommendation. 

Even after the front-end shows "Appointment Confirmed!", The user is still able to click "Select this provider." 

twilio:
After I send a text message to the user with the recommendations, Even if there's only one recommendation, it still asks the user to select one, two, or three. 



implement option B from docs/plans/FIX_WEBHOOK_TIMEOUT_AND_FRONTEND_DISPLAY.md

plan tomorrow:
get full kestra workflow working locally

plan saturday:
get cloud kestra workflow working

plan sunday:
final polish and demo video
# latest tasks
0. find code state for vapi as of 12/10/2025 11:46pm 2outboundPhoneCall
Assistant

1. Even after the call is successfully terminated, the front-end does not show the recommended providers and displays an error. 
2. Even at the end of the call, and after saying goodbye the assistant never disconnects 
3. the assistant is asking too many questions in a row which may be overwhelming. it needs to ask one question at a time. also doesn't mention the customer's name
4. need to test direct api call (pending to do)


7. fix cline code review workflow (in progress)


# old tasks
1. fix frontend display issue - do not wait for the calls to end wihch will time out, and just use polling to check the status of the call.
2. make sure we have twilio webhook handler to handle user responses to the recommendations. (in progress)
3. make sure that we willnotify user by text using twilio or by calling them using vapi.ai (in progress)
4. test latest kestra cloud integration
5. deploy latest workflows / scripts to kestra cloud
6. create provider workflow
7. test entire workflow - research, call, analyze, update user, book, notify user and make sure we have proper UI display at each step





ketra cloud integration
fix ui display

store call history in the db




0. update existing research feature to select 10 providers, capturing distance, location, phone, hours of operation, and rating that meet the user's criteria. 
1. wire up vapi / research features to current /new page 
- requests new service provider, 
- show 10 service providers
- show calling service providers
2. test / wire up update feature (phone text) to let user know about the 3 providers found and offer top recommendation. Ask user what he wants to do. 
3. create new workflow to schedule the time with the selected provider
4. wire up direct task page (/direct) to have vapi.ai call the given provider on user's behalf and give update to the user afterwards. 
5. need to create new update user workflow / direct access


Questions: 
1. Can I make multiple calls at the same time using the same phone number in VAPI.ai?
2. can I use vapi.ai API to send texts from my vapi.ai number instead of using twilio?


in progress:
update research



completed
disqualification logic
cline CLI scripts



Future features: 
1. If the provider says the time is no longer available, then the agent will Ask for the next available time and reach out to the user again to confirm.
2. Send reminders to the user before the appointment to confirm.
3. After the appointment is confirmed, allow the user to reschedule the appointment by calling the provider. 
4. make this work for booking restauraunt reservations
5. Also read reviews and analyze reviews when determining whether to recommend provider
6. Find providers from sources other than Google Maps / places
7. Based on user's request, analyze with gemini and ask the user any additional questions the provider might ask during the call. Then preview a conversation outline with the provider
8. use gemini live to be more intelligent / personable
9. show better update UI
10. allow /direct page to be more useful
11. allow app to work with automated systems - wait on hold then speak to a human.
12. Make sure that the user can also be notified of results through phone. 
13. Provider recommendations are taking a long time. Need to make it faster. 
14. We only show the call transcripts after all calls are completed. We should show the call transcripts as each one is completed, especially ones that are unanswered. 
15. 

