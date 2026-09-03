/**
 * Class dùng chung cho form.
 *
 * Gom vào một chỗ thay vì chép chuỗi Tailwind dài ở từng file — chép thì sớm
 * muộn cũng có một ô nhập trông khác những ô còn lại, và không ai biết cái nào
 * mới là đúng.
 *
 * Giữ danh sách này NGẮN. Cần nhiều hơn vài dòng nghĩa là đã tới lúc dựng
 * component thật (`<Input>`, `<Button>`), không phải nhét thêm chuỗi vào đây.
 */

export const inputClass =
  "w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900 dark:focus:ring-brand-900";

export const primaryButtonClass =
  "w-full rounded-md bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700 disabled:opacity-60";

export const linkClass = "text-brand-600 underline hover:text-brand-700";
