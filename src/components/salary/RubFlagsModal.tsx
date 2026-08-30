import { useSalaryContext } from "./SalaryContext";
import { Modal } from "../ui/Modal";
import { Tag } from "lucide-react";
import { api } from "../../lib/api";

export function RubFlagsModal() {
  const ctx = useSalaryContext();
  const { showRubFlagsModal, setShowRubFlagsModal, rubriques, setRubriques } = ctx;

  return (
    <Modal
      open={showRubFlagsModal}
      onClose={() => setShowRubFlagsModal(false)}
      title="Gestion des rubriques"
      subtitle="Cotisable / Imposable"
      icon={<Tag className="h-5 w-5" />}
      size="md"
    >
      <div className="max-h-96 overflow-y-auto rounded-lg border border-gray-200">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-gray-500">Code</th>
              <th className="px-3 py-2 text-left font-medium text-gray-500">Libellé</th>
              <th className="px-3 py-2 text-center font-medium text-gray-500">Cotisable</th>
              <th className="px-3 py-2 text-center font-medium text-gray-500">Imposable</th>
            </tr>
          </thead>
          <tbody>
            {rubriques.filter(r => {
              const libelle = String(r.libelle ?? "").trim();
              const isManual = Number(r.manuelle ?? 0) === 1 || !String(r.formule ?? "").trim();
              return libelle && isManual && (Number(r.classe ?? 0) === 1 || Number(r.classe ?? 0) === 2);
            }).map(r => {
              const code = String(r.code);
              const libelle = String(r.libelle ?? "—");
              const isSecuS = Number(r.is_secu_s ?? 0) !== 0;
              const isImpos = Number(r.is_impos ?? 0) !== 0;
              return (
                <tr key={code} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-1.5 font-mono text-gray-400">R{code}</td>
                  <td className="px-3 py-1.5 text-gray-700">{libelle}</td>
                  <td className="px-3 py-1.5 text-center"><input type="checkbox" checked={isSecuS} onChange={async (e) => { try { await api.updateRubriqueFlags(code, { isSecuS: e.target.checked }); const fresh = await api.getRubriques(); setRubriques(fresh); } catch (err) { console.error(err); } }} /></td>
                  <td className="px-3 py-1.5 text-center"><input type="checkbox" checked={isImpos} onChange={async (e) => { try { await api.updateRubriqueFlags(code, { isImpos: e.target.checked }); const fresh = await api.getRubriques(); setRubriques(fresh); } catch (err) { console.error(err); } }} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
