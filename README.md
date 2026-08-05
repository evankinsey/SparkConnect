# Sample Snack app

Open the `App.js` file to start writing some code. You can preview the changes directly on your phone or tablet by scanning the **QR code** or use the iOS or Android emulators. When you're done, click **Save** and share the link!

When you're ready to see everything that Expo provides (or if you want to use your own editor) you can **Download** your project and use it with [expo cli](https://docs.expo.dev/get-started/installation/#expo-cli)).

All projects created in Snack are publicly available, so you can easily share the link to this project via link, or embed it on a web page with the `<>` button.

If you're having problems, you can tweet to us [@expo](https://twitter.com/expo) or ask in our [forums](https://forums.expo.dev/c/expo-dev-tools/61) or [Discord](https://chat.expo.dev/).

Snack is Open Source. You can find the code on the [GitHub repo](https://github.com/expo/snack).

## Daily Code Question reminder

One NEC question is delivered every morning to the lock screen / notification centre,
and tapping it opens SparkConnect on that day's question.

- Bank and date-stable selection: `src/dailyQuestions.js`
- Scheduling, permissions, tap handling: `src/dailyNotifications.js`
- User controls: Settings → App Settings → **Daily Code Question Alert** / **Reminder Time**

**It will not fire in Expo Go or the web preview.** Expo Go dropped notification
support on Android in SDK 53, so this needs a development build or a real
TestFlight / Play build:

```
npx expo install expo-notifications      # keep it on the SDK-matched version
eas build --profile development --platform ios     # or android
```

There is no true Home Screen *widget*: that requires native iOS WidgetKit (Swift)
and Android AppWidgetProvider (Kotlin), neither of which can be written in JS.
The scheduled notification is the cross-platform equivalent.
