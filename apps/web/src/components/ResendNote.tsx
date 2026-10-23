import { ErrorText } from "./ui";

export function ResendNote({ status, message }: { status: string; message: string }) {
  if (status === "sent") return <div role="status" className="small lime">{message}</div>;
  if (status === "error") return <ErrorText>{message}</ErrorText>;
  return null;
}
