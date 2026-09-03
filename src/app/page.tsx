import { redirect } from 'next/navigation';

/** Нүүр хуудас нь enterprise dashboard руу чиглүүлнэ (§1). */
export default function HomePage() {
  redirect('/dashboard');
}
