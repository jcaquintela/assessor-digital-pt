// Configuração partilhada dos providers de calendário.
// Este ficheiro é seguro para o browser: só nomes, labels e scopes.

export type CalendarProvider = "google_calendar" | "microsoft_outlook";

export const CALENDAR_PROVIDERS: CalendarProvider[] = ["google_calendar", "microsoft_outlook"];

export const CALENDAR_PROVIDER_LABEL: Record<CalendarProvider, string> = {
  google_calendar: "Google Calendar",
  microsoft_outlook: "Microsoft Outlook",
};

export const CALENDAR_CLIENT_KEY_ENV: Record<CalendarProvider, string> = {
  google_calendar: "GOOGLE_CALENDAR_APP_USER_CONNECTOR_CLIENT_API_KEY",
  microsoft_outlook: "MICROSOFT_OUTLOOK_APP_USER_CONNECTOR_CLIENT_API_KEY",
};

export const CALENDAR_SCOPES: Record<CalendarProvider, string[]> = {
  google_calendar: [
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/calendar.events",
  ],
  microsoft_outlook: ["openid", "profile", "email", "offline_access", "Calendars.ReadWrite"],
};

// Rota de retorno do OAuth (popup) por provider.
export const CALENDAR_RETURN_PATH: Record<CalendarProvider, string> = {
  google_calendar: "/oauth/google-calendar/return",
  microsoft_outlook: "/oauth/outlook/return",
};

export const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev";

export function isCalendarProvider(v: unknown): v is CalendarProvider {
  return v === "google_calendar" || v === "microsoft_outlook";
}