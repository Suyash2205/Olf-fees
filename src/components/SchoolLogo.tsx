import Image from "next/image";

type SchoolLogoProps = {
  size?: number;
  className?: string;
  priority?: boolean;
};

export default function SchoolLogo({
  size = 36,
  className = "",
  priority = false,
}: SchoolLogoProps) {
  return (
    <Image
      src="/olf-logo.jpg"
      alt="Our Lady of Fatima School logo"
      width={size}
      height={size}
      className={`rounded-full object-cover ${className}`}
      priority={priority}
    />
  );
}
