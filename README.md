# uber-receipts
Sums up all your Uber expenses by getting data from receipts on your Gmail Account.

### Note:
* Currently works for ₱ (Philippine Peso) Currency as I use it for myself. But you can change it to work for yours by editing `var PATTERN_UBER_RIDE_COST = '[\\₱]\\d+.\\d+';`
* Does not support multiple currency.

### How to use:
* Create an app and enable Gmail api https://developers.google.com/gmail/api/quickstart/js#prerequisites
* Download the client_secret.json
* run `npm install`
* run `node receipts.js` or run `node receipts.js yyyy/mm/dd yyyy/mm/dd` eg.2017/01/01

### License
```
Copyright 2017 Gian Darren Azriel Aquino

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```
