// Minimal subset of https://core.telegram.org/bots/api types used by the bot.

export interface User {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
  language_code?: string;
}

export interface Chat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
}

export interface PhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

export interface Document {
  file_id: string;
  file_unique_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

export interface Message {
  message_id: number;
  from?: User;
  chat: Chat;
  date: number;
  text?: string;
  caption?: string;
  photo?: PhotoSize[];
  document?: Document;
}

export interface CallbackQuery {
  id: string;
  from: User;
  message?: Message;
  data?: string;
}

export interface Update {
  update_id: number;
  message?: Message;
  edited_message?: Message;
  callback_query?: CallbackQuery;
}

export interface File {
  file_id: string;
  file_unique_id: string;
  file_size?: number;
  file_path?: string;
}

export interface InlineKeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}

export interface ApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}
