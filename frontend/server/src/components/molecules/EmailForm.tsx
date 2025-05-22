import { type Dispatch, type FC, type SetStateAction, memo } from "react";
import type { UseFormReturn } from "react-hook-form";
import { EmailInput } from "../atoms/input/EmailInput";
import { FormControl, FormField, FormLabel } from "../ui/form";

type Props = {
  form: UseFormReturn;
  placeholder?: string;
  email: string;
  setEmail: Dispatch<SetStateAction<string>>;
};

export const EmailForm: FC<Props> = memo((props) => {
  const { form, placeholder = "メールアドレス", email, setEmail } = props;
  return (
    <FormField
      control={form.control}
      name="email"
      render={() => (
        <>
          <FormLabel>メールアドレス</FormLabel>
          <FormControl>
            <EmailInput placeholder={placeholder} email={email} setEmail={setEmail} />
          </FormControl>
        </>
      )}
    />
  );
});
