/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */

export type ScheduledLocalisationAuditSite = {
  name: string;
  url: string;
  category: string;
};

/**
 * Sites the daily cron audits, in rotation order.
 * The cron picks the sites with no audit first, then the ones audited longest ago.
 */
export const SCHEDULED_LOCALISATION_AUDIT_SITES: readonly ScheduledLocalisationAuditSite[] = [
  { name: "Canva", url: "https://canva.com/", category: "Design & productivity" },
  { name: "Adobe", url: "https://adobe.com/", category: "Design & productivity" },
  { name: "Figma", url: "https://figma.com/", category: "Design & productivity" },
  { name: "Notion", url: "https://notion.com/", category: "Design & productivity" },
  { name: "Miro", url: "https://miro.com/", category: "Design & productivity" },
  { name: "Dropbox", url: "https://dropbox.com/", category: "Design & productivity" },
  { name: "Evernote", url: "https://evernote.com/", category: "Design & productivity" },
  { name: "Microsoft", url: "https://microsoft.com/", category: "Design & productivity" },
  { name: "Google", url: "https://google.com/", category: "Design & productivity" },
  { name: "Prezi", url: "https://prezi.com/", category: "Design & productivity" },
  { name: "Atlassian", url: "https://atlassian.com/", category: "Business software" },
  { name: "Slack", url: "https://slack.com/", category: "Business software" },
  { name: "Asana", url: "https://asana.com/", category: "Business software" },
  { name: "monday.com", url: "https://monday.com/", category: "Business software" },
  { name: "Trello", url: "https://trello.com/", category: "Business software" },
  { name: "Zoom", url: "https://zoom.com/", category: "Business software" },
  { name: "Salesforce", url: "https://salesforce.com/", category: "Business software" },
  { name: "HubSpot", url: "https://hubspot.com/", category: "Business software" },
  { name: "Zendesk", url: "https://zendesk.com/", category: "Business software" },
  { name: "Freshworks", url: "https://freshworks.com/", category: "Business software" },
  { name: "GitHub", url: "https://github.com/", category: "Developer & website tools" },
  { name: "GitLab", url: "https://about.gitlab.com/", category: "Developer & website tools" },
  { name: "JetBrains", url: "https://jetbrains.com/", category: "Developer & website tools" },
  { name: "Docker", url: "https://docker.com/", category: "Developer & website tools" },
  { name: "Cloudflare", url: "https://cloudflare.com/", category: "Developer & website tools" },
  { name: "DigitalOcean", url: "https://digitalocean.com/", category: "Developer & website tools" },
  { name: "AWS", url: "https://aws.amazon.com/", category: "Developer & website tools" },
  { name: "WordPress.com", url: "https://wordpress.com/", category: "Developer & website tools" },
  { name: "Wix", url: "https://wix.com/", category: "Developer & website tools" },
  { name: "Shopify", url: "https://shopify.com/", category: "Developer & website tools" },
  { name: "Amazon", url: "https://amazon.com/", category: "Retail & marketplaces" },
  { name: "eBay", url: "https://ebay.com/", category: "Retail & marketplaces" },
  { name: "Etsy", url: "https://etsy.com/", category: "Retail & marketplaces" },
  { name: "AliExpress", url: "https://aliexpress.com/", category: "Retail & marketplaces" },
  { name: "IKEA", url: "https://ikea.com/", category: "Retail & marketplaces" },
  { name: "H&M", url: "https://hm.com/", category: "Retail & marketplaces" },
  { name: "Zara", url: "https://zara.com/", category: "Retail & marketplaces" },
  { name: "UNIQLO", url: "https://uniqlo.com/", category: "Retail & marketplaces" },
  { name: "Nike", url: "https://nike.com/", category: "Retail & marketplaces" },
  { name: "adidas", url: "https://adidas.com/", category: "Retail & marketplaces" },
  { name: "Booking.com", url: "https://booking.com/", category: "Travel & accommodation" },
  { name: "Airbnb", url: "https://airbnb.com/", category: "Travel & accommodation" },
  { name: "Expedia", url: "https://expedia.com/", category: "Travel & accommodation" },
  { name: "Tripadvisor", url: "https://tripadvisor.com/", category: "Travel & accommodation" },
  { name: "Agoda", url: "https://agoda.com/", category: "Travel & accommodation" },
  { name: "Skyscanner", url: "https://skyscanner.com/", category: "Travel & accommodation" },
  { name: "KAYAK", url: "https://kayak.com/", category: "Travel & accommodation" },
  { name: "GetYourGuide", url: "https://getyourguide.com/", category: "Travel & accommodation" },
  { name: "Klook", url: "https://klook.com/", category: "Travel & accommodation" },
  { name: "Trip.com", url: "https://trip.com/", category: "Travel & accommodation" },
  { name: "PayPal", url: "https://paypal.com/", category: "Finance & payments" },
  { name: "Wise", url: "https://wise.com/", category: "Finance & payments" },
  { name: "Revolut", url: "https://revolut.com/", category: "Finance & payments" },
  { name: "Stripe", url: "https://stripe.com/", category: "Finance & payments" },
  { name: "Adyen", url: "https://adyen.com/", category: "Finance & payments" },
  { name: "Payoneer", url: "https://payoneer.com/", category: "Finance & payments" },
  { name: "Western Union", url: "https://westernunion.com/", category: "Finance & payments" },
  { name: "Remitly", url: "https://remitly.com/", category: "Finance & payments" },
  { name: "N26", url: "https://n26.com/", category: "Finance & payments" },
  { name: "Klarna", url: "https://klarna.com/", category: "Finance & payments" },
  { name: "Netflix", url: "https://netflix.com/", category: "Media & entertainment" },
  { name: "Spotify", url: "https://spotify.com/", category: "Media & entertainment" },
  { name: "Disney+", url: "https://disneyplus.com/", category: "Media & entertainment" },
  { name: "YouTube", url: "https://youtube.com/", category: "Media & entertainment" },
  { name: "TikTok", url: "https://tiktok.com/", category: "Media & entertainment" },
  { name: "Deezer", url: "https://deezer.com/", category: "Media & entertainment" },
  { name: "Crunchyroll", url: "https://crunchyroll.com/", category: "Media & entertainment" },
  { name: "SoundCloud", url: "https://soundcloud.com/", category: "Media & entertainment" },
  { name: "Twitch", url: "https://twitch.tv/", category: "Media & entertainment" },
  { name: "Vimeo", url: "https://vimeo.com/", category: "Media & entertainment" },
  { name: "Duolingo", url: "https://duolingo.com/", category: "Education & learning" },
  { name: "Coursera", url: "https://coursera.org/", category: "Education & learning" },
  { name: "Udemy", url: "https://udemy.com/", category: "Education & learning" },
  { name: "Khan Academy", url: "https://khanacademy.org/", category: "Education & learning" },
  { name: "edX", url: "https://edx.org/", category: "Education & learning" },
  { name: "Babbel", url: "https://babbel.com/", category: "Education & learning" },
  { name: "Busuu", url: "https://busuu.com/", category: "Education & learning" },
  { name: "Preply", url: "https://preply.com/", category: "Education & learning" },
  { name: "Quizlet", url: "https://quizlet.com/", category: "Education & learning" },
  { name: "Kahoot!", url: "https://kahoot.com/", category: "Education & learning" },
  { name: "WhatsApp", url: "https://whatsapp.com/", category: "Consumer apps & security" },
  { name: "Telegram", url: "https://telegram.org/", category: "Consumer apps & security" },
  { name: "Signal", url: "https://signal.org/", category: "Consumer apps & security" },
  { name: "Discord", url: "https://discord.com/", category: "Consumer apps & security" },
  { name: "Viber", url: "https://viber.com/", category: "Consumer apps & security" },
  { name: "Proton", url: "https://proton.me/", category: "Consumer apps & security" },
  { name: "NordVPN", url: "https://nordvpn.com/", category: "Consumer apps & security" },
  { name: "ExpressVPN", url: "https://expressvpn.com/", category: "Consumer apps & security" },
  { name: "Surfshark", url: "https://surfshark.com/", category: "Consumer apps & security" },
  { name: "1Password", url: "https://1password.com/", category: "Consumer apps & security" },
  { name: "Apple", url: "https://apple.com/", category: "Hardware & gaming" },
  { name: "Samsung", url: "https://samsung.com/", category: "Hardware & gaming" },
  { name: "Sony", url: "https://sony.com/", category: "Hardware & gaming" },
  { name: "Lenovo", url: "https://lenovo.com/", category: "Hardware & gaming" },
  { name: "HP", url: "https://hp.com/", category: "Hardware & gaming" },
  { name: "Dell", url: "https://dell.com/", category: "Hardware & gaming" },
  { name: "Logitech", url: "https://logitech.com/", category: "Hardware & gaming" },
  { name: "PlayStation", url: "https://playstation.com/", category: "Hardware & gaming" },
  { name: "Xbox", url: "https://xbox.com/", category: "Hardware & gaming" },
  { name: "Steam", url: "https://store.steampowered.com/", category: "Hardware & gaming" },
];
