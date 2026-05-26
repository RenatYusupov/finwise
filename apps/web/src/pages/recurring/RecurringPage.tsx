import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ALL_CATEGORIES, EXPENSE_CATEGORIES, useFinanceStore, type RecurringPayment } from '@/features/finance/store';
import { CategoryPicker } from '@/features/finance/CategoryPicker';
import { formatCurrency } from '@/shared/utils/format';

function haptic(type: 'light' | 'success' | 'warning' = 'light') {
  const hf = window.Telegram?.WebApp?.HapticFeedback;
  if (!hf) return;
  if (type === 'success') hf.notificationOccurred?.('success');
  else if (type === 'warning') hf.notificationOccurred?.('warning');
  else hf.impactOccurred?.('light');
}

function confidenceValue(p: RecurringPayment): number {
  if (p.confirmedByUser || p.source === 'manual') return 1;
  if (p.confidence === 'high') return 0.9;
  if (p.confidence === 'medium') return 0.7;
  return 0.4;
}

function dayLabel(day: number): string {
  return day >= 31 ? 'в последнее число месяца' : `${day}-го числа`;
}

function categoryInfo(categoryId?: string) {
  return ALL_CATEGORIES.find((c) => c.id === categoryId) ?? EXPENSE_CATEGORIES.find((c) => c.id === 'other_exp')!;
}

type FormState = {
  label: string;
  amount: string;
  dayOfMonth: string;
  categoryId: string;
  editId?: string;
};

function PaymentForm({
  initial,
  onClose,
}: {
  initial?: RecurringPayment;
  onClose: () => void;
}) {
  const addRecurringPayment = useFinanceStore((s) => s.addRecurringPayment);
  const updateRecurringPayment = useFinanceStore((s) => s.updateRecurringPayment);
  const [form, setForm] = useState<FormState>({
    label: initial?.label ?? '',
    amount: String(initial?.amountMedian ?? ''),
    dayOfMonth: String(initial?.dayOfMonth ?? 1),
    categoryId: 'home',
    ...(initial?.id ? { editId: initial.id } : {}),
  });

  const day = Number(form.dayOfMonth);
  const amount = Number(form.amount.replace(',', '.'));
  const dayInvalid = !day || day < 1 || day > 31;
  const canSave = form.label.trim().length > 0 && amount > 0 && !dayInvalid;

  const save = () => {
    if (!canSave) return;
    if (form.editId) {
      updateRecurringPayment(form.editId, {
        label: form.label.trim(),
        amountMedian: Math.round(amount),
        dayOfMonth: day,
        confidence: 'high',
        confirmedByUser: true,
        dismissedByUser: false,
      });
    } else {
      addRecurringPayment({
        label: form.label.trim(),
        amountMedian: Math.round(amount),
        dayOfMonth: day,
        source: 'manual',
        confidence: 'high',
        confirmedByUser: true,
        dismissedByUser: false,
      });
    }
    haptic('success');
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end bg-black/40"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        className="w-full bg-white rounded-t-3xl px-5 pt-4 max-h-[88vh] overflow-y-auto"
        style={{ paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">{initial ? 'Изменить платёж' : 'Новый регулярный платёж'}</h2>
          <button onClick={onClose} className="text-gray-400 text-sm haptic">Закрыть</button>
        </div>

        <div className="space-y-4">
          <label className="block">
            <span className="text-xs font-semibold text-gray-500 uppercase">Название</span>
            <input
              defaultValue={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              className="mt-1 w-full rounded-2xl border border-gray-200 px-4 py-3 text-[16px] outline-none focus:border-purple-400"
              placeholder="Например: Интернет"
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-gray-500 uppercase">Сумма</span>
            <input
              defaultValue={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              type="number"
              inputMode="decimal"
              className="mt-1 w-full rounded-2xl border border-gray-200 px-4 py-3 text-[16px] outline-none focus:border-purple-400"
              placeholder="5200"
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-gray-500 uppercase">День месяца</span>
            <input
              defaultValue={form.dayOfMonth}
              onChange={(e) => setForm((f) => ({ ...f, dayOfMonth: e.target.value }))}
              type="number"
              inputMode="numeric"
              min={1}
              max={31}
              className={`mt-1 w-full rounded-2xl border px-4 py-3 text-[16px] outline-none ${dayInvalid ? 'border-red-300 bg-red-50' : 'border-gray-200 focus:border-purple-400'}`}
            />
            {dayInvalid && <span className="mt-1 block text-xs text-red-500">День должен быть от 1 до 31</span>}
          </label>

          <div>
            <span className="text-xs font-semibold text-gray-500 uppercase">Категория</span>
            <div className="mt-2">
              <CategoryPicker
                type="expense"
                selected={form.categoryId}
                onChange={(catId) => setForm((f) => ({ ...f, categoryId: catId }))}
              />
            </div>
          </div>

          <button
            disabled={!canSave}
            onClick={save}
            className="w-full rounded-2xl py-3 font-bold text-white haptic disabled:opacity-40"
            style={{ background: '#6C63FF' }}
          >
            Сохранить
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function PaymentCard({ payment }: { payment: RecurringPayment }) {
  const updateRecurringPayment = useFinanceStore((s) => s.updateRecurringPayment);
  const deleteRecurringPayment = useFinanceStore((s) => s.deleteRecurringPayment);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const cat = categoryInfo(undefined);
  const needsConfirm = payment.source === 'auto' && !payment.confirmedByUser && confidenceValue(payment) < 0.7;
  const showBadge = payment.source === 'auto' && !payment.confirmedByUser;

  const confirm = () => {
    updateRecurringPayment(payment.id, { confirmedByUser: true, confidence: 'high', dismissedByUser: false });
    haptic('success');
  };

  const remove = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      haptic('warning');
      setTimeout(() => setConfirmDelete(false), 2500);
      return;
    }
    deleteRecurringPayment(payment.id);
    haptic('success');
  };

  return (
    <motion.div layout className="bg-white rounded-2xl p-4 shadow-sm border border-gray-50">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-2xl bg-purple-50 flex items-center justify-center text-xl flex-shrink-0">{cat.icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-gray-900 truncate">{payment.label.length > 40 ? `${payment.label.slice(0, 37)}...` : payment.label}</h3>
            {showBadge && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 font-bold">
                {Math.round(confidenceValue(payment) * 100)}%
              </span>
            )}
          </div>
          <div className="text-sm text-gray-500 mt-0.5">~{formatCurrency(payment.amountMedian)} · {dayLabel(payment.dayOfMonth)}</div>
          <div className="text-xs text-gray-400 mt-1">{cat.icon} {cat.name} · {payment.source === 'manual' ? 'добавлено вручную' : 'обнаружено автоматически'}</div>
        </div>
      </div>

      <div className="flex gap-2 mt-3">
        {needsConfirm && (
          <button onClick={confirm} className="flex-1 py-2 rounded-xl bg-green-50 text-green-700 text-xs font-bold haptic">✓ Подтвердить</button>
        )}
        <button onClick={() => setEditing(true)} className="flex-1 py-2 rounded-xl bg-gray-100 text-gray-700 text-xs font-bold haptic">✏️ Изменить</button>
        <button onClick={remove} className="flex-1 py-2 rounded-xl bg-red-50 text-red-600 text-xs font-bold haptic">{confirmDelete ? '✓ Точно?' : '🗑️ Удалить'}</button>
      </div>

      <AnimatePresence>
        {editing && <PaymentForm initial={payment} onClose={() => setEditing(false)} />}
      </AnimatePresence>
    </motion.div>
  );
}

function Section({ title, payments, empty }: { title: string; payments: RecurringPayment[]; empty?: string }) {
  if (payments.length === 0) {
    if (!empty) return null;
    return <div className="text-sm text-gray-400 bg-white rounded-2xl p-4 text-center">{empty}</div>;
  }
  return (
    <section>
      <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2 px-1">{title}</h2>
      <div className="space-y-2">
        {payments.map((p) => <PaymentCard key={p.id} payment={p} />)}
      </div>
    </section>
  );
}

export function RecurringPage() {
  const recurringPayments = useFinanceStore((s) => s.recurringPayments);
  const runDetectRecurringPayments = useFinanceStore((s) => s.runDetectRecurringPayments);
  const [showForm, setShowForm] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const grouped = useMemo(() => {
    const active = recurringPayments.filter((p) => !p.dismissedByUser);
    const confirmed = active.filter((p) => (p.confirmedByUser || p.source === 'manual' || confidenceValue(p) >= 0.7));
    const pending = active.filter((p) => p.source === 'auto' && !p.confirmedByUser && confidenceValue(p) < 0.7);
    const inactive = recurringPayments.filter((p) => p.dismissedByUser);
    const total = confirmed.reduce((sum, p) => sum + p.amountMedian, 0);
    return { confirmed, pending, inactive, total };
  }, [recurringPayments]);

  const detect = () => {
    runDetectRecurringPayments();
    haptic('success');
  };

  const isEmpty = recurringPayments.length === 0;

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="px-4 pt-6 pb-4 bg-white border-b border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">🔁 Регулярные</h1>
            <p className="text-xs text-gray-400 mt-0.5">Подписки, аренда, коммуналка и другие обязательные платежи</p>
          </div>
          <button onClick={() => setShowForm(true)} className="w-10 h-10 rounded-full bg-purple-600 text-white text-xl font-bold haptic">+</button>
        </div>
        <button onClick={detect} className="w-full rounded-2xl py-2.5 bg-purple-50 text-purple-700 text-sm font-bold haptic">
          🔎 Обновить автообнаружение
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5" style={{ paddingBottom: 'calc(92px + env(safe-area-inset-bottom, 0px))' }}>
        {isEmpty ? (
          <div className="text-center py-12 px-4 bg-white rounded-3xl">
            <div className="text-5xl mb-4">🔎</div>
            <h2 className="font-bold text-gray-900 mb-2">Регулярные платежи не обнаружены</h2>
            <p className="text-sm text-gray-500 mb-5">Добавьте вручную или импортируйте выписку из банка</p>
            <div className="flex gap-2 justify-center">
              <button onClick={() => setShowForm(true)} className="px-4 py-2 rounded-xl bg-purple-600 text-white text-sm font-bold haptic">Добавить вручную</button>
              <Link to="/profile" className="px-4 py-2 rounded-xl bg-gray-100 text-gray-700 text-sm font-bold haptic">Импортировать</Link>
            </div>
          </div>
        ) : (
          <>
            <Section title="Требуют подтверждения" payments={grouped.pending} />
            <Section title="Подтверждённые" payments={grouped.confirmed} empty="Подтверждённых регулярных платежей пока нет" />
            {grouped.inactive.length > 0 && (
              <section>
                <button onClick={() => setShowInactive((v) => !v)} className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2 px-1 haptic">
                  {showInactive ? 'Скрыть неактивные' : `Показать неактивные (${grouped.inactive.length})`}
                </button>
                {showInactive && <div className="space-y-2">{grouped.inactive.map((p) => <PaymentCard key={p.id} payment={p} />)}</div>}
              </section>
            )}
          </>
        )}
      </div>

      <div className="fixed left-0 right-0 z-40 px-4 pb-2" style={{ bottom: 'calc(68px + env(safe-area-inset-bottom, 0px))' }}>
        <div className="bg-gray-900 text-white rounded-2xl px-4 py-3 shadow-xl flex items-center justify-between">
          <span className="text-sm text-gray-300">Итого в месяц</span>
          <span className="font-bold text-lg">{formatCurrency(grouped.total)}</span>
        </div>
      </div>

      <AnimatePresence>
        {showForm && <PaymentForm onClose={() => setShowForm(false)} />}
      </AnimatePresence>
    </div>
  );
}
