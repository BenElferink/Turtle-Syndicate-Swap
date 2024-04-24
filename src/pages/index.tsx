import { Fragment, useMemo, useState } from 'react'
import axios from 'axios'
import { useWallet } from '@meshsdk/react'
import { useAuth } from '@/contexts/AuthContext'
import { firestore } from '@/utils/firebase'
import badLabsApi from '@/utils/badLabsApi'
import formatTokenAmount from '@/functions/formatTokenAmount'
import buildTxs from '@/functions/buildTxs'
import Url from '@/components/Url'
import Button from '@/components/Button'
import ProgressBar from '@/components/ProgressBar'
import ConnectWalletModal from '@/components/ConnectWalletModal'
import { DECIMALS, DEV_WALLET_ADDRESS, MINT_WALLET_ADDRESS, TEAM_WALLET_ADDRESS } from '@/constants'

const Page = () => {
  const { user } = useAuth()
  const { wallet } = useWallet()
  const [openConnectModal, setOpenConnectModal] = useState(false)
  const [progress, setProgress] = useState({
    msg: '',
    loading: false,
    done: false,
    batch: {
      current: 0,
      max: 0,
    },
  })

  const total = useMemo(() => user?.tokens?.length || 0, [user?.tokens?.length])

  const handleTradeIn = async () => {
    if (!user?.tokens?.length) return alert('user has insufficient tokens for this action')

    const { now } = await badLabsApi.getTimestamps()

    const dbPayload: DbPayload = {
      timestamp: now,
      address: user.addresses.find(({ isScript }) => !isScript)?.address || '',
      amount: total,
      didBurn: false,
      didMint: false,
    }

    if (!dbPayload.address) return alert('wallet does not have a change address')

    const collection = firestore.collection('turtle-syndicate-swaps')
    const { id: docId } = await collection.add(dbPayload)

    setProgress((prev) => ({ ...prev, loading: true, msg: 'Batching TXs...' }))

    await buildTxs(
      wallet,
      [
        {
          address: DEV_WALLET_ADDRESS,
          tokenId: 'lovelace',
          amount: formatTokenAmount.toChain(Math.max(user.tokens.length * 0.5, 1), DECIMALS['ADA']),
        },
        {
          address: MINT_WALLET_ADDRESS,
          tokenId: 'lovelace',
          amount: formatTokenAmount.toChain(user.tokens.length * 2, DECIMALS['ADA']),
        },
        ...user.tokens.map((t) => ({
          address: TEAM_WALLET_ADDRESS,
          tokenId: t.tokenId,
          amount: t.tokenAmount.onChain,
        })),
      ],
      (msg, currentBatch, totalBatches) => {
        setProgress((prev) => ({
          ...prev,
          msg,
          batch: { current: currentBatch, max: totalBatches },
        }))
      }
    )

    await collection.doc(docId).update({
      didBurn: true,
    })

    await axios.post('/mint', { docId })

    setProgress((prev) => ({ ...prev, loading: false, done: true }))
  }

  return (
    <div className='w-screen h-screen flex flex-col items-center justify-between'>
      <header className='p-4 text-center'>
        <h1 className='text-3xl'>Turtle Syndicate</h1>
        <p>Trade-in your old Turtles for brand new &amp; upgraded Turtles!</p>
      </header>

      {!user ? (
        <div>
          <Button label='Connect' onClick={() => setOpenConnectModal(true)} />
          <ConnectWalletModal isOpen={openConnectModal} onClose={() => setOpenConnectModal(false)} />
        </div>
      ) : (
        <div className='text-center'>
          <p>
            Hello,
            <br />
            <span className='text-sm'>
              <Url src={`https://pool.pm/${user.stakeKey}`} label={user.stakeKey} />
            </span>
          </p>

          <p>
            You have {total} NFTs to trade-in {total ? '🥳' : '😔'}
            <br />
            <br />
            <Button label='Trade In' disabled={!total || progress.loading || progress.done} onClick={handleTradeIn} />
            {!progress.done && progress.batch.max ? (
              <Fragment>
                <br />
                <br />
                <ProgressBar label='TX Batches' max={progress.batch.max} current={progress.batch.current} />
              </Fragment>
            ) : null}
          </p>
        </div>
      )}

      <footer className='p-4 text-center'>
        <h6 className='text-sm'>
          Developed by <Url src='https://badfoxmc.com' label='BadFoxMC' />
        </h6>
      </footer>
    </div>
  )
}

export default Page
