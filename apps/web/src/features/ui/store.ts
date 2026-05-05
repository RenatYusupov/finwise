import { create } from 'zustand';

interface UIState {
  modalOpenCount: number;
  openModal: () => void;
  closeModal: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  modalOpenCount: 0,
  openModal: () => set((s) => ({ modalOpenCount: s.modalOpenCount + 1 })),
  closeModal: () => set((s) => ({ modalOpenCount: Math.max(0, s.modalOpenCount - 1) })),
}));
