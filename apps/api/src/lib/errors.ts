export class AppError extends Error {
  constructor(public statusCode: number, message: string, public code = 'HATA') {
    super(message);
  }
}
export const notFound = (what = 'Kayıt') => new AppError(404, `${what} bulunamadı.`, 'BULUNAMADI');
export const badRequest = (msg: string) => new AppError(400, msg, 'GECERSIZ');
export const forbidden = (msg = 'Bu işlem için yetkiniz yok.') => new AppError(403, msg, 'YETKISIZ');
export const unauthorized = (msg = 'Oturum açmanız gerekiyor.') => new AppError(401, msg, 'OTURUM');
export const conflict = (msg: string) => new AppError(409, msg, 'CAKISMA');
