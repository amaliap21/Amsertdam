"use client";

import { X, Upload, CirclePlus } from "lucide-react";
import { useState } from "react";

type CreateFlashcardModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    deckName: string;
    file: File | null;
  }) => void;
};

export default function CreateFlashcardModal({
  isOpen,
  onClose,
  onSubmit,
}: CreateFlashcardModalProps) {
  const [formData, setFormData] = useState({
    deckName: "",
    file: null as File | null,
  });
  const [isDragging, setIsDragging] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
    setFormData({ deckName: "", file: null });
    onClose();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFormData({ ...formData, file: e.target.files[0] });
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFormData({ ...formData, file: e.dataTransfer.files[0] });
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 flex justify-center items-center z-50"
      style={{ background: "rgba(0, 0, 0, 0.5)" }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-8 relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-6 right-6 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X size={24} />
        </button>

        {/* Header */}
        <div className="mb-8">
          <h2 className="text-2xl font-semibold text-black-primary mb-2">
            Create Flashcard
          </h2>
          <p className="text-sm text-gray-primary">
            Upload an image or PDF, AI will turn it into flashcards
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Deck Name */}
          <div>
            <label className="block text-sm font-medium text-black-primary mb-3">
              Deck Name<span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g., Database Terms"
              value={formData.deckName}
              onChange={(e) =>
                setFormData({ ...formData, deckName: e.target.value })
              }
              className="w-full px-4 py-3.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-primary focus:border-transparent text-black-primary placeholder:text-gray-400"
              required
            />
          </div>

          {/* PDF/Image Upload */}
          <div>
            <label className="block text-sm font-medium text-black-primary mb-3">
              PDF/Image
            </label>
            <label
              htmlFor="file-upload"
              className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
                isDragging
                  ? "border-indigo-primary bg-indigo-50"
                  : "border-gray-300 bg-white hover:bg-gray-50"
              }`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <Upload size={24} className="text-gray-400 mb-2" />
                <p className="text-sm text-gray-500">
                  {formData.file ? (
                    <span className="font-medium text-indigo-primary">
                      {formData.file.name}
                    </span>
                  ) : (
                    "Upload an image or PDF (max. 5 MB)"
                  )}
                </p>
              </div>
              <input
                id="file-upload"
                type="file"
                className="hidden"
                accept="image/*,.pdf"
                onChange={handleFileChange}
              />
            </label>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            className="w-full flex items-center justify-center gap-2 px-4 py-4 bg-indigo-primary text-white rounded-xl hover:bg-indigo-600 transition-colors font-medium"
          >
            <CirclePlus size={20} />
            Create Flashcard
          </button>
        </form>
      </div>
    </div>
  );
}
