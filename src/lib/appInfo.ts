// Общие сведения о приложении. Версия берётся из package.json при сборке.
export const APP_NAME = 'Дневник самочувствия';
export const APP_SHORT_NAME = 'Дневник';
export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';
