import { resolveLocale, type SupportedLocale } from "@rendezvous/i18n";

export function requestLocale(
  headers: Readonly<Record<string, unknown>>,
): SupportedLocale {
  const raw = headers["accept-language"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return resolveLocale([value]);
}

const ERROR_MESSAGES: Record<SupportedLocale, Record<string, string>> = {
  en: {
    BAD_REQUEST: "The request is invalid",
    UNAUTHORIZED: "Authentication is required",
    FORBIDDEN: "You do not have permission for this action",
    NOT_FOUND: "The requested item was not found",
    METHOD_NOT_ALLOWED: "This action is not supported",
    CONFLICT: "The request conflicts with the current trip state",
    VALIDATION_FAILED: "Check the entered data",
    RATE_LIMITED: "Too many requests. Please try again later",
    INTERNAL_ERROR: "Internal server error",
    REQUEST_FAILED: "The request could not be completed",
    TRIP_CLOSED: "This trip is closed",
    TRIP_FULL: "This trip already has all expected participants",
    UNKNOWN_CITY: "The selected city is not supported",
    RESULT_NOT_FOUND: "The requested result is no longer available",
    INVALID_RESULT: "The selected result is invalid",
    COMPUTATION_RUNNING: "Route calculation is already running",
    TRIP_NOT_READY: "At least two participants must submit preferences first",
    RESULT_NOT_READY: "The ranking is still being calculated",
    STALE: "Trip data changed during the update. Try again",
    STALE_RESULT: "The result is outdated. Refresh the ranking and try again",
    INCOMPLETE_RESULT: "The result does not cover all participants",
    HOTEL_UNAVAILABLE: "No hotel is available for the selected option",
    EMPTY_SHORTLIST: "The group choice cannot be empty",
    INVALID_STATE: "This action is not available for the current trip state",
    INVALID_PERIOD: "Check the trip dates",
    TRIP_FINALIZED: "This trip is finalized",
    ORGANIZER_CANNOT_LEAVE: "The organizer must cancel the trip instead",
    INVALID_TELEGRAM_AUTH: "Telegram sign-in data is invalid",
    TELEGRAM_AUTH_EXPIRED: "Telegram sign-in data expired. Try again",
  },
  ru: {
    BAD_REQUEST: "Некорректный запрос",
    UNAUTHORIZED: "Требуется авторизация",
    FORBIDDEN: "Недостаточно прав для этого действия",
    NOT_FOUND: "Запрошенные данные не найдены",
    METHOD_NOT_ALLOWED: "Это действие не поддерживается",
    CONFLICT: "Запрос конфликтует с текущим состоянием поездки",
    VALIDATION_FAILED: "Проверьте введённые данные",
    RATE_LIMITED: "Слишком много запросов. Попробуйте позже",
    INTERNAL_ERROR: "Внутренняя ошибка сервера",
    REQUEST_FAILED: "Не удалось выполнить запрос",
    TRIP_CLOSED: "Эта поездка закрыта",
    TRIP_FULL: "В поездке уже участвует ожидаемое количество людей",
    UNKNOWN_CITY: "Выбранный город не поддерживается",
    RESULT_NOT_FOUND: "Запрошенный результат больше недоступен",
    INVALID_RESULT: "Выбранный результат недействителен",
    COMPUTATION_RUNNING: "Маршрут уже пересчитывается",
    TRIP_NOT_READY: "Сначала минимум два участника должны заполнить условия",
    RESULT_NOT_READY: "Рейтинг ещё рассчитывается",
    STALE: "Данные поездки изменились во время обновления. Попробуйте ещё раз",
    STALE_RESULT: "Результат устарел. Обновите рейтинг и попробуйте ещё раз",
    INCOMPLETE_RESULT: "Результат охватывает не всех участников",
    HOTEL_UNAVAILABLE: "Для выбранного варианта нет доступного отеля",
    EMPTY_SHORTLIST: "Общий выбор не может быть пустым",
    INVALID_STATE: "Это действие недоступно для текущего состояния поездки",
    INVALID_PERIOD: "Проверьте даты поездки",
    TRIP_FINALIZED: "Эта поездка зафиксирована",
    ORGANIZER_CANNOT_LEAVE: "Организатору нужно отменить поездку",
    INVALID_TELEGRAM_AUTH: "Данные входа Telegram недействительны",
    TELEGRAM_AUTH_EXPIRED: "Данные входа Telegram устарели. Попробуйте ещё раз",
  },
};

export function localizedErrorMessage(
  code: string,
  locale: SupportedLocale,
): string {
  return ERROR_MESSAGES[locale][code] ?? ERROR_MESSAGES[locale].REQUEST_FAILED!;
}
