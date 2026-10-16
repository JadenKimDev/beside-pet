interface EmergencyCardProps {
  name: string;
  number: string;
  description: string;
  url: string;
}

export default function EmergencyCard({ name, number, description, url }: EmergencyCardProps) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="block bg-white border border-gray-100 rounded-xl p-5 hover:shadow-md transition-shadow"
    >
      <h3 className="font-semibold text-gray-900 mb-1">{name}</h3>
      <p className="text-2xl font-bold text-primary-600 mb-2">{number}</p>
      <p className="text-sm text-gray-500">{description}</p>
    </a>
  );
}
