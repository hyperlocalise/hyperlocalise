import { defineMessages, FormattedMessage } from "react-intl";

export const formatjsFixtureMessages = defineMessages({
  signInTitle: {
    id: "auth.signIn.title",
    defaultMessage: "Sign in to your workspace",
    description: "Heading on the sign-in screen",
  },
  pendingReviews: {
    id: "dashboard.pendingReviews",
    defaultMessage:
      "{count, plural, =0{No reviews pending} one{# review pending} other{# reviews pending}}",
    description: "Dashboard card showing how many reviews still need approval",
  },
  trialNotice: {
    id: "billing.trialNotice",
    defaultMessage: "Your trial ends on {date}.",
    description: "Notice displayed when the workspace is in a trial period",
  },
  emailSubject: {
    id: "notifications.email.subject",
    defaultMessage: "{name} mentioned you in {projectName}",
    description: "Subject line for mention notification emails",
  },
});

export function FormatjsFixtureMessages() {
  return (
    <>
      <FormattedMessage {...formatjsFixtureMessages.signInTitle} />
      <FormattedMessage {...formatjsFixtureMessages.pendingReviews} values={{ count: 0 }} />
      <FormattedMessage {...formatjsFixtureMessages.trialNotice} values={{ date: "July 7" }} />
      <FormattedMessage
        {...formatjsFixtureMessages.emailSubject}
        values={{ name: "Alex", projectName: "Hyperlocalise" }}
      />
    </>
  );
}
