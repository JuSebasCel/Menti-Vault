import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { direccionDeArchivo } from '../repositorio'
import { USOS_DEL_CONSENTIMIENTO } from '../tipos'
import type { DatosDelEvento, Ponente } from '../tipos'
import { mismoPonente } from '../formato'
import { BotonMind, Chip, Icono } from './piezas'

/*
  Lo que ve el ponente, para que el organizador sepa qué está pidiendo: el
  correo que le llega y la página a la que lo lleva, donde autoriza cada uso
  y aprueba (o corrige) el texto de su ponencia.

  Aquí es una vista previa: marcar casillas o aprobar no escribe nada, porque
  quien la mira es el organizador y no el ponente.
*/
export function VistaDelPonente({ ponente, datos }: { ponente: Ponente; datos: DatosDelEvento }): ReactElement {
  const [vista, setVista] = useState<'correo' | 'pagina'>('correo')

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <Chip elegido={vista === 'correo'} onClick={() => setVista('correo')}>
          El correo
        </Chip>
        <Chip elegido={vista === 'pagina'} onClick={() => setVista('pagina')}>
          La página del ponente
        </Chip>
      </div>
      {vista === 'correo' ? (
        <CorreoDeInvitacion nombre={ponente.nombre} correo={ponente.correo ?? 'correo del ponente'} evento={datos.evento.nombre} />
      ) : (
        <PaginaDelPonente ponente={ponente} datos={datos} />
      )}
    </div>
  )
}

export function CorreoDeInvitacion({ nombre, correo, evento }: { nombre: string; correo: string; evento: string }): ReactElement {
  return (
    <div className="tarjeta-borde flex flex-col overflow-hidden rounded-[24px]">
      <div className="flex flex-col gap-1 border-b border-filete bg-panel px-5 py-4 text-sm">
        <span>
          <span className="text-texto-tenue">De: </span>
          {evento} vía Menti Vault
        </span>
        <span>
          <span className="text-texto-tenue">Para: </span>
          {correo}
        </span>
        <span>
          <span className="text-texto-tenue">Asunto: </span>
          <span className="font-medium">Tu ponencia en {evento}: autorización y revisión</span>
        </span>
      </div>
      <div className="flex flex-col gap-4 px-5 py-5 text-[15px] leading-relaxed">
        <p>Hola, {nombre.split(' ')[0]}:</p>
        <p>
          Gracias por participar en {evento}. Antes de incluir tu ponencia en la memoria del evento necesitamos dos
          cosas: que autorices cómo vamos a usar la grabación y que revises el texto que redactamos a partir de ella.
        </p>
        <p>Cada uso se autoriza por separado, y puedes cambiar tu decisión en cualquier momento desde el mismo enlace.</p>
        <span className="flex h-11 w-fit items-center gap-2 rounded-full bg-acento px-6 text-sm font-medium text-acento-contraste">
          Revisar y autorizar <Icono nombre="arrow_forward" className="text-lg" />
        </span>
        <p className="text-sm text-texto-tenue">
          El enlace es personal. Tus datos se tratan conforme a la Ley 1581 de 2012 y a la política de tratamiento de
          datos del organizador.
        </p>
      </div>
    </div>
  )
}

function PaginaDelPonente({ ponente, datos }: { ponente: Ponente; datos: DatosDelEvento }): ReactElement {
  const ponencia = datos.ponencias.find((una) => mismoPonente(una.ponente, ponente.nombre))
  const memoria = datos.memorias.find((una) => una.idConferencia === ponencia?.id)
  const [marcados, setMarcados] = useState<string[]>(USOS_DEL_CONSENTIMIENTO.map((uso) => uso.clave))
  const [pdf, setPdf] = useState<string | null>(null)
  const [respuesta, setRespuesta] = useState<'aprobar' | 'cambios' | null>(null)

  useEffect(() => {
    if (memoria?.archivoPdf != null) {
      void direccionDeArchivo(memoria.archivoPdf).then(setPdf)
    }
  }, [memoria?.archivoPdf])

  return (
    <div className="flex max-h-[62vh] flex-col gap-4 overflow-y-auto rounded-[24px] bg-panel p-5">
      <div className="flex flex-col gap-1">
        <span className="text-xs tracking-wide text-texto-tenue uppercase">{datos.evento.nombre}</span>
        <span className="text-2xl font-semibold">Hola, {ponente.nombre.split(' ')[0]}</span>
      </div>

      <section className="flex flex-col gap-2 rounded-[20px] bg-fondo p-4">
        <span className="font-medium">1. Autoriza el uso de tu ponencia</span>
        {USOS_DEL_CONSENTIMIENTO.map((uso) => {
          const marcado = marcados.includes(uso.clave)
          return (
            <button
              key={uso.clave}
              type="button"
              onClick={() => setMarcados(marcado ? marcados.filter((otro) => otro !== uso.clave) : [...marcados, uso.clave])}
              className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-1.5 text-left text-sm hover:bg-panel"
            >
              <Icono nombre={marcado ? 'check_box' : 'check_box_outline_blank'} className="text-xl" />
              {uso.etiqueta}
            </button>
          )
        })}
      </section>

      <section className="flex flex-col gap-3 rounded-[20px] bg-fondo p-4">
        <span className="font-medium">2. Revisa el texto de tu ponencia</span>
        {ponencia === undefined ? null : <span className="text-sm text-texto-tenue">{ponencia.titulo}</span>}
        {pdf === null ? (
          <div className="h-72 animate-pulse rounded-2xl bg-panel" />
        ) : (
          <iframe src={`${pdf}#toolbar=0&view=FitH`} title="Memoria de la ponencia" className="h-96 w-full rounded-2xl bg-white" />
        )}
        {respuesta === null ? (
          <div className="flex gap-2">
            <BotonMind icono="task_alt" onClick={() => setRespuesta('aprobar')}>
              Aprobar mi texto
            </BotonMind>
            <BotonMind variante="tenue" icono="edit" onClick={() => setRespuesta('cambios')}>
              Pedir cambios
            </BotonMind>
          </div>
        ) : (
          <p className="rounded-2xl bg-[var(--mind-tonal)] px-4 py-3 text-sm [color:var(--mind-tonal-texto)]">
            {respuesta === 'aprobar'
              ? 'Así lo aprobaría el ponente. Es una vista previa: no se guardó nada.'
              : 'Aquí el ponente escribe qué corregir. Es una vista previa: no se guardó nada.'}
          </p>
        )}
      </section>
    </div>
  )
}
