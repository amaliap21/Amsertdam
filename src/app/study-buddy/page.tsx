import { redirect } from "next/navigation";

// Study Buddy now lives as a tab inside Community.
export default function StudyBuddyRedirect() {
  redirect("/community");
}
