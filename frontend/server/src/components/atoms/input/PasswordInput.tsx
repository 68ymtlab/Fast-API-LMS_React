import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eye, EyeOff } from "lucide-react";
import { type Dispatch, type FC, type SetStateAction, memo, useState } from "react";

type Props = {
  placeholder?: string;
  disabled?: boolean;
  password: string;
  setPassword: Dispatch<SetStateAction<string>>;
};

export const PasswordInput: FC<Props> = memo((props) => {
  const { placeholder = "パスワード", disabled = false, password, setPassword } = props;
  const [showPassword, setShowPassword] = useState(false);
  return (
    <div className="relative flex items-center">
      <Input
        type={showPassword ? "text" : "password"}
        placeholder={placeholder}
        value={password}
        disabled={disabled}
        onChange={(e) => setPassword(e.target.value)}
        className="w-full h-11 px-3 py-2 pr-10 border border-input rounded-md shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 hover:cursor-pointer"
        onClick={() => setShowPassword(!showPassword)}
        disabled={password === "" || disabled}
        aria-label={showPassword ? "Hide password" : "Show password"}
      >
        {showPassword ? (
          <EyeOff className="size-4" aria-hidden="true" />
        ) : (
          <Eye className="size-4" aria-hidden="true" />
        )}
      </Button>
    </div>
  );
});
PasswordInput.displayName = "PasswordInput";
