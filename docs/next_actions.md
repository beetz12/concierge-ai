*tasks*:

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


