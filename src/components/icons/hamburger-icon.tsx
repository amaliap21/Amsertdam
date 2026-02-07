import React from "react";

interface HamburgerIconProps {
  size: number;
  className?: string;
}

const HamburgerIcon: React.FC<HamburgerIconProps> = ({ size, className }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 34 21"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path d="M2 2.1665H32" strokeWidth="3" strokeLinecap="round" />
      <path d="M2 10.5H32" strokeWidth="3" strokeLinecap="round" />
      <path d="M2 18.833H32" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
};

export default HamburgerIcon;
