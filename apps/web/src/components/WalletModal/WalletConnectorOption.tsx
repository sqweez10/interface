import { UseMutateFunction } from '@tanstack/react-query'
import Loader from 'components/Icons/LoadingSpinner'
import { DetectedBadge } from 'components/WalletModal/shared'
import { ConnectorID, useConnectorWithId } from 'components/WalletModal/useOrderedConnections'
import { CONNECTOR_ICON_OVERRIDE_MAP, useRecentConnectorId } from 'components/Web3Provider/constants'
import { uniswapWalletConnect, walletTypeToAmplitudeWalletType } from 'components/Web3Provider/walletConnect'
import { useConnect } from 'hooks/useConnect'
import { useSignInWithPasskey } from 'hooks/useSignInWithPasskey'
import { useAtom } from 'jotai'
import { useMemo } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { persistHideMobileAppPromoBannerAtom } from 'state/application/atoms'
import { ThemedText } from 'theme/components'
import { Flex, Image, Text, useSporeColors } from 'ui/src'
import { UNISWAP_LOGO } from 'ui/src/assets'
import { Chevron } from 'ui/src/components/icons/Chevron'
import { Passkey } from 'ui/src/components/icons/Passkey'
import { ScanQr } from 'ui/src/components/icons/ScanQr'
import { WalletFilled } from 'ui/src/components/icons/WalletFilled'
import { UseSporeColorsReturn } from 'ui/src/hooks/useSporeColors'
import { iconSizes } from 'ui/src/theme'
import Badge, { BadgeVariant } from 'uniswap/src/components/badge/Badge'
import { CONNECTION_PROVIDER_IDS } from 'uniswap/src/constants/web3'
import { FeatureFlags } from 'uniswap/src/features/gating/flags'
import { useFeatureFlag } from 'uniswap/src/features/gating/hooks'
import Trace from 'uniswap/src/features/telemetry/Trace'
import { ElementName, InterfaceEventName } from 'uniswap/src/features/telemetry/constants'
import { isPlaywrightEnv } from 'utilities/src/environment/env'
import { isMobileWeb } from 'utilities/src/platform'
import { isIFramed } from 'utils/isIFramed'
import { Connector } from 'wagmi'

export enum AlternativeOption {
  OTHER_WALLETS = 'OTHER_WALLETS',
}

const RecentBadge = () => (
  <Badge badgeVariant={BadgeVariant.SOFT} borderRadius={4} p={1} px={4}>
    <ThemedText.LabelMicro color="accent1">
      <Trans i18nKey="common.recent" />
    </ThemedText.LabelMicro>
  </Badge>
)

function EmbeddedWalletIcon() {
  return (
    <Flex p="$spacing6" backgroundColor="$accent2" borderRadius="$rounded8">
      <Passkey color="$accent1" size="$icon.20" />
    </Flex>
  )
}

function UniswapMobileIcon({ iconSize }: { iconSize: number }) {
  return isMobileWeb ? (
    <Image height={iconSize} source={UNISWAP_LOGO} width={iconSize} />
  ) : (
    <ScanQr size={iconSize} minWidth={iconSize} color="$accent1" backgroundColor="$accent2" borderRadius={8} p={7} />
  )
}

function OtherWalletsIcon() {
  return (
    <Flex p="$spacing6" backgroundColor="$accent2" borderRadius="$rounded8">
      <WalletFilled size={20} color="$accent1" />
    </Flex>
  )
}

/**
 * We have custom icons for certain Uniswap Connectors.
 * This function returns the correct icon for the connector.
 */
function getIcon({
  connector,
  connectorId,
  isEmbeddedWalletEnabled,
  themeColors,
}: {
  connector?: Connector
  connectorId: string
  isEmbeddedWalletEnabled: boolean
  themeColors: UseSporeColorsReturn
}) {
  const iconSize = isEmbeddedWalletEnabled ? iconSizes.icon32 : iconSizes.icon40

  if (connectorId === CONNECTION_PROVIDER_IDS.EMBEDDED_WALLET_CONNECTOR_ID) {
    return <EmbeddedWalletIcon />
  } else if (connectorId === CONNECTION_PROVIDER_IDS.UNISWAP_WALLET_CONNECT_CONNECTOR_ID) {
    return <UniswapMobileIcon iconSize={iconSize} />
  } else if (connectorId === AlternativeOption.OTHER_WALLETS) {
    return <OtherWalletsIcon />
  } else {
    const icon = CONNECTOR_ICON_OVERRIDE_MAP[connectorId] ?? connector?.icon
    // TODO(WEB-7217): RN Web Image is not properly displaying base64 encoded images (Phantom logo) */
    return (
      <img
        src={icon}
        alt={connector?.name}
        style={{
          width: iconSize,
          height: iconSize,
          borderRadius: 8,
          border: `1px solid ${themeColors.surface3.val}`,
        }}
      />
    )
  }
}

function getConnectorText({
  connector,
  connectorId,
  t,
}: {
  connector?: Connector
  connectorId: string
  t: ReturnType<typeof useTranslation>['t']
}) {
  if (connectorId === CONNECTION_PROVIDER_IDS.UNISWAP_WALLET_CONNECT_CONNECTOR_ID) {
    return t('common.uniswapMobile')
  } else if (connectorId === AlternativeOption.OTHER_WALLETS) {
    return t('wallet.other')
  } else if (connectorId === CONNECTION_PROVIDER_IDS.EMBEDDED_WALLET_CONNECTOR_ID) {
    return t('account.passkey.log.in.title')
  } else {
    return connector?.name
  }
}

function RightSideDetail({
  isPendingConnection,
  isRecent,
  detected,
  isOtherWallets,
}: {
  isPendingConnection: boolean
  isRecent: boolean
  detected?: boolean
  isOtherWallets?: boolean
}) {
  if (isPendingConnection) {
    return <Loader />
  } else if (isRecent) {
    return <RecentBadge />
  } else if (detected) {
    return <DetectedBadge />
  } else if (isOtherWallets) {
    return <Chevron rotate="180deg" size="$icon.24" color="$neutral3" />
  }
  return null
}

function createWalletConnectionHandler({
  connection,
  setPersistHideMobileAppPromoBanner,
  signInWithPasskey,
}: {
  connection: ReturnType<typeof useConnect>
  setPersistHideMobileAppPromoBanner: (value: boolean) => void
  signInWithPasskey: UseMutateFunction<{ walletAddress: string; exported?: boolean }, Error, void, unknown>
}) {
  async function connectEmbeddedWallet() {
    await signInWithPasskey()
  }

  function connectUniswapWallet() {
    setPersistHideMobileAppPromoBanner(true)
    connection.connect({
      // Initialize Uniswap Wallet on click instead of in wagmi config
      // to avoid multiple wallet connect sockets being opened
      // and causing issues with messages getting dropped
      connector: uniswapWalletConnect(),
    })
  }

  function connectStandardWallet(connector: Connector) {
    // This is a hack to ensure the connection runs in playwright
    // TODO(WEB-4173): Look into removing setTimeout connection.connect({ connector })
    if (isPlaywrightEnv()) {
      setTimeout(() => connection.connect({ connector }), 1)
    } else {
      connection.connect({ connector })
    }
  }

  return function handleWalletConnection({
    connectorId,
    connector,
    onPress,
  }: {
    connectorId: string
    connector?: Connector
    onPress?: () => void
  }): void {
    if (onPress) {
      onPress()
      return
    }

    switch (connectorId) {
      case CONNECTION_PROVIDER_IDS.EMBEDDED_WALLET_CONNECTOR_ID:
        connectEmbeddedWallet()
        return

      case CONNECTION_PROVIDER_IDS.UNISWAP_WALLET_CONNECT_CONNECTOR_ID:
        connectUniswapWallet()
        return

      default:
        if (!connector) {
          return
        }
        connectStandardWallet(connector)
        return
    }
  }
}

export function EVMOption({
  connectorId,
  detected,
  onPress,
}: {
  connectorId: string
  detected?: boolean
  onPress?: () => void
}) {
  const { t } = useTranslation()
  const connection = useConnect()
  const connector = useConnectorWithId(connectorId as ConnectorID)
  const isEmbeddedWalletEnabled = useFeatureFlag(FeatureFlags.EmbeddedWallet)
  const { signInWithPasskey } = useSignInWithPasskey()
  const [, setPersistHideMobileAppPromoBanner] = useAtom(persistHideMobileAppPromoBannerAtom)
  const isPendingConnection = connection.isPending && connection.variables.connector === connector
  const isRecent = connectorId === useRecentConnectorId()
  const themeColors = useSporeColors()
  const icon = getIcon({ connector, connectorId, isEmbeddedWalletEnabled, themeColors })
  const text = getConnectorText({ connector, connectorId, t })
  // TODO(WEB-4173): Remove isIFrame check when we can update wagmi to version >= 2.9.4
  const isDisabled = Boolean(connection.isPending && !isIFramed())

  const handleConnectionFn = useMemo(
    () =>
      createWalletConnectionHandler({
        connection,
        setPersistHideMobileAppPromoBanner,
        signInWithPasskey,
      }),
    [connection, setPersistHideMobileAppPromoBanner, signInWithPasskey],
  )

  const handleConnect = () => handleConnectionFn({ connectorId, connector, onPress })

  return (
    <WalletConnectorOption
      icon={icon}
      text={text}
      handleConnect={handleConnect}
      isPendingConnection={isPendingConnection}
      isRecent={isRecent}
      isDetected={Boolean(detected)}
      isDisabled={isDisabled}
      walletMeta={{
        name: connector?.name,
        type: connector?.type,
        connectorId,
      }}
    />
  )
}

function WalletConnectorOption({
  icon,
  text,
  handleConnect,
  isPendingConnection,
  isRecent,
  isDetected,
  isDisabled,
  walletMeta,
}: {
  icon: JSX.Element
  text: string | undefined
  handleConnect: () => void
  isPendingConnection: boolean
  isRecent: boolean
  isDetected: boolean
  isDisabled: boolean
  walletMeta: {
    connectorId: string
    name?: string
    type?: string
  }
}) {
  const isEmbeddedWalletEnabled = useFeatureFlag(FeatureFlags.EmbeddedWallet)
  const isOtherWallets = walletMeta.connectorId === AlternativeOption.OTHER_WALLETS

  return (
    <Flex
      backgroundColor={isEmbeddedWalletEnabled ? 'transparent' : '$surface2'}
      row
      alignItems="center"
      width="100%"
      justifyContent="space-between"
      position="relative"
      px="$spacing12"
      py="$spacing18"
      cursor={isDisabled ? 'auto' : 'pointer'}
      hoverStyle={{ backgroundColor: isDisabled ? '$surface2' : '$surface1Hovered' }}
      opacity={isDisabled && !isPendingConnection ? 0.5 : 1}
      data-testid={`wallet-option-${walletMeta.type}`}
      onPress={handleConnect}
    >
      <Trace
        logPress
        eventOnTrigger={InterfaceEventName.WalletSelected}
        properties={{
          wallet_name: walletMeta.name ?? walletMeta.connectorId,
          wallet_type: walletTypeToAmplitudeWalletType(walletMeta.type ?? walletMeta.connectorId),
        }}
        element={ElementName.WalletTypeOption}
      >
        <Flex row alignItems="center" gap="$gap12">
          {icon}
          <Text variant="body2" py="$spacing8">
            {text}
          </Text>
        </Flex>
        <RightSideDetail
          isPendingConnection={isPendingConnection}
          isRecent={isRecent}
          detected={isDetected}
          isOtherWallets={isOtherWallets}
        />
      </Trace>
    </Flex>
  )
}
