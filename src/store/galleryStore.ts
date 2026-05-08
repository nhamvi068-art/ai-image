import { create } from 'zustand'
import {
  getAllGalleryImages,
  getAllReferenceImages,
  deleteGalleryImage,
  toggleGalleryFavorite,
  deleteReferenceImage,
  addReferenceImage,
  type GalleryImage,
  type ReferenceImage,
} from '../db/db'
import { useChatStore } from './chatStore'

export type GalleryTab = 'generated' | 'reference'

interface GalleryStore {
  isOpen: boolean
  activeTab: GalleryTab
  selectedImage: GalleryImage | null
  images: GalleryImage[]
  referenceImages: ReferenceImage[]
  isLoading: boolean

  openGallery: () => void
  closeGallery: () => void
  setActiveTab: (tab: GalleryTab) => void
  selectImage: (img: GalleryImage | null) => void
  loadGalleryImages: () => Promise<void>
  loadReferenceImages: () => Promise<void>
  deleteGalleryImage: (id: number) => Promise<void>
  toggleFavorite: (id: number) => Promise<void>
  addReference: (src: string, name: string) => Promise<void>
  deleteReference: (id: number) => Promise<void>
  useAsReference: (src: string) => void
}

export const useGalleryStore = create<GalleryStore>((set, get) => ({
  isOpen: false,
  activeTab: 'generated',
  selectedImage: null,
  images: [],
  referenceImages: [],
  isLoading: false,

  openGallery: () => {
    set({ isOpen: true })
    get().loadGalleryImages()
    get().loadReferenceImages()
  },

  closeGallery: () => {
    set({ isOpen: false, selectedImage: null })
  },

  setActiveTab: (tab) => set({ activeTab: tab }),

  selectImage: (img) => set({ selectedImage: img }),

  loadGalleryImages: async () => {
    set({ isLoading: true })
    const images = await getAllGalleryImages()
    set({ images, isLoading: false })
  },

  loadReferenceImages: async () => {
    const referenceImages = await getAllReferenceImages()
    set({ referenceImages })
  },

  deleteGalleryImage: async (id) => {
    await deleteGalleryImage(id)
    set((s) => ({ images: s.images.filter((i) => i.id !== id) }))
  },

  toggleFavorite: async (id) => {
    await toggleGalleryFavorite(id)
    set((s) => ({
      images: s.images.map((i) =>
        i.id === id ? { ...i, isFavorite: !i.isFavorite } : i
      ),
    }))
  },

  addReference: async (src, name) => {
    await addReferenceImage({ src, name, createdAt: new Date() })
    get().loadReferenceImages()
  },

  deleteReference: async (id) => {
    await deleteReferenceImage(id)
    set((s) => ({ referenceImages: s.referenceImages.filter((i) => i.id !== id) }))
  },

  useAsReference: (src) => {
    useChatStore.getState().setEditReferenceImages([src])
    get().closeGallery()
  },
}))
