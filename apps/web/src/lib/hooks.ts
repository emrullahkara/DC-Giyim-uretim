import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui';

/** Kaydet/güncelle işlemleri: başarıda bildirim + ilgili listeleri tazele */
export function useAction<TVars = void, TRes = any>(fn: (v: TVars) => Promise<TRes>, opts: { success?: string | ((r: TRes) => string); invalidate?: string[][]; onDone?: (r: TRes) => void } = {}) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r) => {
      if (opts.success) toast('ok', typeof opts.success === 'function' ? opts.success(r) : opts.success);
      (opts.invalidate ?? []).forEach((k) => qc.invalidateQueries({ queryKey: k }));
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      opts.onDone?.(r);
    },
    onError: (e: Error) => toast('err', e.message),
  });
}
