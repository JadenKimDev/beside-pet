import { failureRate, type ModelUsage, PurposeBadge, sortByCalls } from '@/entities/metrics';
import { formatCount, formatMs, formatPercent, formatUsd } from '@/shared/lib';
import { Card, Table, TBody, Td, THead, Th, Tr } from '@/shared/ui';

const rowKey = (row: ModelUsage) =>
  `${row.provider}/${row.model}/${row.purpose}/${row.promptVersion}`;
const modelName = (row: ModelUsage) => `${row.provider} / ${row.model}`;
const firstToken = (row: ModelUsage) => formatMs(row.firstTokenP50Ms ?? null);

const NUMBER_HEADERS = [
  '호출',
  '실패율',
  '입력 토큰',
  '출력 토큰',
  'p50',
  'p95',
  '첫 글자 p50',
  '비용',
];

function numbers(row: ModelUsage): string[] {
  return [
    formatCount(row.calls),
    formatPercent(failureRate(row)),
    formatCount(row.inputTokens),
    formatCount(row.outputTokens),
    formatMs(row.p50Ms),
    formatMs(row.p95Ms),
    firstToken(row),
    formatUsd(row.costUsd),
  ];
}

/** 나눠 보기. 768px 이상은 표, 아래는 행마다 카드. 호출 내림차순. */
export function BreakdownTable({ rows }: { rows: readonly ModelUsage[] }) {
  const sorted = sortByCalls(rows);
  return (
    <>
      <div className="hidden md:block">
        <Table>
          <THead>
            <tr>
              <Th>모델</Th>
              <Th>역할</Th>
              <Th>프롬프트 버전</Th>
              {NUMBER_HEADERS.map((header) => (
                <Th key={header} className="text-right">
                  {header}
                </Th>
              ))}
            </tr>
          </THead>
          <TBody>
            {sorted.map((row) => (
              <Tr key={rowKey(row)}>
                <Td className="max-w-56 truncate" title={modelName(row)}>
                  {modelName(row)}
                </Td>
                <Td>
                  <PurposeBadge purpose={row.purpose} />
                </Td>
                <Td>{row.promptVersion}</Td>
                {numbers(row).map((value, index) => (
                  <Td key={NUMBER_HEADERS[index]} className="text-right whitespace-nowrap">
                    {value}
                  </Td>
                ))}
              </Tr>
            ))}
          </TBody>
        </Table>
      </div>
      <ul className="flex flex-col gap-3 md:hidden">
        {sorted.map((row) => (
          <li key={rowKey(row)}>
            <Card className="p-3.5">
              <div className="flex items-center justify-between gap-2">
                <p className="min-w-0 truncate text-sm font-medium text-fg" title={modelName(row)}>
                  {modelName(row)}
                </p>
                <PurposeBadge purpose={row.purpose} />
              </div>
              <p className="mt-0.5 truncate text-xs text-fg-muted">{row.promptVersion}</p>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm tabular-nums">
                {numbers(row).map((value, index) => (
                  <div key={NUMBER_HEADERS[index]} className="flex justify-between gap-2">
                    <dt className="text-fg-muted">{NUMBER_HEADERS[index]}</dt>
                    <dd className="text-fg">{value}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}
