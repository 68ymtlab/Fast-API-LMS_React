import { Input } from "@/components/ui/input";
import { type Dispatch, type FC, type SetStateAction, memo } from "react";

type Props = {
  placeholder?: string;
  email: string;
  setEmail: Dispatch<SetStateAction<string>>;
};

export const EmailInput: FC<Props> = memo((props) => {
  const { placeholder = "メールアドレス", email, setEmail } = props;
  return (
    <Input
      type="email"
      placeholder={placeholder}
      value={email}
      onChange={(e) => setEmail(e.target.value)}
      className="w-full h-11 px-3 py-2 pr-10 border border-input rounded-md shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring"
    />
  );
});
