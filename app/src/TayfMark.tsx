// The Tayf mark: a planet disc seen through the five stops of the site-match spectrum.
const bands = ['#1b2a4a', '#1f5a78', '#23897f', '#7dbb6f', '#f1df6a']

export function TayfMark({ size = 32 }: { size?: number }) {
  return (
    <svg className="tayf-mark" width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <rect width="40" height="40" rx="10" fill="#16181b" />
      <clipPath id="tayf-disc"><circle cx="20" cy="20" r="12" /></clipPath>
      <g clipPath="url(#tayf-disc)">
        {bands.map((fill, index) => <rect key={fill} x={8 + index * 4.8} y="8" width="4.8" height="24" fill={fill} />)}
      </g>
    </svg>
  )
}
