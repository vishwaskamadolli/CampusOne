import { toast } from "sonner";

const warningPattern = /already exists|duplicate|linked|dependency|conflict/i;

export async function toastAction<T>(action: () => Promise<T>, messages: { loading: string; success: string }) {
  const toastId = toast.loading(messages.loading);
  try {
    const result = await action();
    toast.success(messages.success, { id: toastId });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    if (warningPattern.test(message)) toast.warning(message, { id: toastId });
    else toast.error(message, { id: toastId });
    throw error;
  }
}

export function toastError(error: unknown, fallback = "Request failed") {
  const message = error instanceof Error ? error.message : fallback;
  if (warningPattern.test(message)) toast.warning(message);
  else toast.error(message);
}

export function toastWarning(message: string) {
  toast.warning(message);
}

export function toastSuccess(message: string) {
  toast.success(message);
}
