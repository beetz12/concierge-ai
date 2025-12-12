# latest tasks
1. after initiating the request, the Frontend is supposed to first show the steps it's taking such as researching providers... and then show the provider list while it makes the call, but this doesn't happen. 
2. After initiating the call, while the call is still going on, the frontend shows initializing agent... instead of the previous view of show the provider list and the providers being concurrently called. 
3. Even after the call is successfully terminated, the front-end does not show the recommended providers and has an error. 

4. Even at the end of the call, the assistant never disconnects 
5. The user never provided an address so the assistant made up an address (Added address fields with auto-suggest on new requests page but needs testing). 
6. need to test direct api call (pending to do)


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


