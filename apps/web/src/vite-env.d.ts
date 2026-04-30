/// <reference types="vite/client" />

interface TelegramWebApp {
  ready(): void;
  expand(): void;
  close(): void;
  initData: string;
  initDataUnsafe: {
    user?: {
      id: number;
      first_name: string;
      last_name?: string;
      username?: string;
      language_code?: string;
    };
    start_param?: string;
  };
  colorScheme: 'light' | 'dark';
  themeParams: {
    bg_color?: string;
    text_color?: string;
    hint_color?: string;
    link_color?: string;
    button_color?: string;
    button_text_color?: string;
  };
  isExpanded: boolean;
  viewportHeight: number;
  viewportStableHeight: number;
  MainButton: {
    text: string;
    color: string;
    textColor: string;
    isVisible: boolean;
    isActive: boolean;
    show(): void;
    hide(): void;
    enable(): void;
    disable(): void;
    onClick(callback: () => void): void;
    offClick(callback: () => void): void;
    setText(text: string): void;
  };
  BackButton: {
    isVisible: boolean;
    show(): void;
    hide(): void;
    onClick(callback: () => void): void;
    offClick(callback: () => void): void;
  };
  HapticFeedback: {
    impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
    notificationOccurred(type: 'error' | 'success' | 'warning'): void;
    selectionChanged(): void;
  };
  sendData(data: string): void;
  openLink(url: string): void;
  openTelegramLink(url: string): void;
  showAlert(message: string, callback?: () => void): void;
  showConfirm(message: string, callback?: (confirmed: boolean) => void): void;
  setHeaderColor(color: string): void;
  setBackgroundColor(color: string): void;
  enableClosingConfirmation(): void;
  disableClosingConfirmation(): void;
  onEvent(eventType: string, eventHandler: () => void): void;
  offEvent(eventType: string, eventHandler: () => void): void;
  version: string;
  platform: string;
}

interface Window {
  Telegram?: {
    WebApp: TelegramWebApp;
  };
}
