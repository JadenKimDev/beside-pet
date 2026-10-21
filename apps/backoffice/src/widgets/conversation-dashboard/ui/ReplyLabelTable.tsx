import { Card, Table, TBody, Td, THead, Th, Tr } from '@/shared/ui';
import type { ReplyLabelRow } from '../model/cards';

const COLUMNS: { label: string; value: (row: ReplyLabelRow) => string }[] = [
  { label: '일반 위로', value: (row) => row.generic },
  { label: '구체적 반영', value: (row) => row.specific },
  { label: '질문', value: (row) => row.question },
  { label: '일반 위로 비율', value: (row) => row.genericRate },
];

/** 날짜별 답의 상투성 판정 수. 판정기를 끈 턴은 세지 않는다. */
export function ReplyLabelTable({ rows }: { rows: readonly ReplyLabelRow[] }) {
  return (
    <Card className="min-w-0">
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-fg">
          날짜별 답의 라벨{' '}
          <span className="text-xs font-normal text-fg-muted">
            · 날짜는 UTC 기준 · 판정한 답만 센다
          </span>
        </h2>
        <Table>
          <THead>
            <tr>
              <Th>날짜</Th>
              {COLUMNS.map((column) => (
                <Th key={column.label} className="text-right">
                  {column.label}
                </Th>
              ))}
            </tr>
          </THead>
          <TBody>
            {rows.map((row) => (
              <Tr key={row.date}>
                <Td>{row.date}</Td>
                {COLUMNS.map((column) => (
                  <Td key={column.label} className="text-right">
                    {column.value(row)}
                  </Td>
                ))}
              </Tr>
            ))}
          </TBody>
        </Table>
      </div>
    </Card>
  );
}
