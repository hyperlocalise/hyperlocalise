package main

import (
	"fmt"
	"strings"

	"github.com/pulumi/pulumi-gcp/sdk/v9/go/gcp/cloudrunv2"
	"github.com/pulumi/pulumi-gcp/sdk/v9/go/gcp/compute"
	"github.com/pulumi/pulumi-gcp/sdk/v9/go/gcp/projects"
	"github.com/pulumi/pulumi-gcp/sdk/v9/go/gcp/pubsub"
	"github.com/pulumi/pulumi-gcp/sdk/v9/go/gcp/serviceaccount"
	"github.com/pulumi/pulumi-gcp/sdk/v9/go/gcp/servicenetworking"
	"github.com/pulumi/pulumi-gcp/sdk/v9/go/gcp/sql"
	"github.com/pulumi/pulumi-gcp/sdk/v9/go/gcp/storage"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi/config"
)

const (
	defaultRegion          = "us-central1"
	defaultDatabaseName    = "translation"
	defaultDatabaseUser    = "app"
	defaultDatabaseVersion = "POSTGRES_16"
	defaultDatabaseTier    = "db-custom-1-3840"
)

func main() {
	pulumi.Run(func(ctx *pulumi.Context) error {
		cfg := config.New(ctx, "hyperlocalise-gcp")

		project := firstNonEmpty(cfg.Get("project"), config.New(ctx, "gcp").Get("project"))
		if project == "" {
			return fmt.Errorf("config `hyperlocalise-gcp:project` or `gcp:project` is required")
		}

		region := firstNonEmpty(cfg.Get("region"), config.New(ctx, "gcp").Get("region"), defaultRegion)
		stackName := sanitizeName(ctx.Stack())
		namePrefix := fmt.Sprintf("hl-%s", stackName)

		apiImage := cfg.Require("apiServiceImage")
		translationImage := cfg.Require("translationServiceImage")
		dispatcherImage := cfg.Require("dispatcherImage")
		workerImage := cfg.Require("workerImage")
		llmProvider := cfg.Require("llmProvider")
		llmModel := cfg.Require("llmModel")
		llmSystemPrompt := cfg.Get("llmSystemPrompt")
		llmUserPrompt := cfg.Get("llmUserPrompt")
		databasePassword := cfg.RequireSecret("databasePassword")

		labels := pulumi.StringMap{
			"app":         pulumi.String("hyperlocalise"),
			"component":   pulumi.String("translation-platform"),
			"environment": pulumi.String(stackName),
			"managed-by":  pulumi.String("pulumi"),
		}

		services, err := enableRequiredServices(ctx, project)
		if err != nil {
			return err
		}

		network, err := compute.NewNetwork(ctx, "core-network", &compute.NetworkArgs{
			Name:                  pulumi.String(fmt.Sprintf("%s-vpc", namePrefix)),
			Project:               pulumi.String(project),
			AutoCreateSubnetworks: pulumi.Bool(false),
		})
		if err != nil {
			return err
		}

		subnetwork, err := compute.NewSubnetwork(ctx, "core-subnetwork", &compute.SubnetworkArgs{
			Name:                  pulumi.String(fmt.Sprintf("%s-subnet", namePrefix)),
			Project:               pulumi.String(project),
			Region:                pulumi.String(region),
			Network:               network.ID(),
			IpCidrRange:           pulumi.String("10.20.0.0/24"),
			PrivateIpGoogleAccess: pulumi.Bool(true),
			Purpose:               pulumi.String("PRIVATE"),
			StackType:             pulumi.String("IPV4_ONLY"),
			LogConfig:             &compute.SubnetworkLogConfigArgs{AggregationInterval: pulumi.String("INTERVAL_10_MIN"), FlowSampling: pulumi.Float64(0.5), Metadata: pulumi.String("INCLUDE_ALL_METADATA")},
			SecondaryIpRanges:     compute.SubnetworkSecondaryIpRangeArray{},
		}, pulumi.DependsOn(services))
		if err != nil {
			return err
		}

		router, err := compute.NewRouter(ctx, "nat-router", &compute.RouterArgs{
			Name:    pulumi.String(fmt.Sprintf("%s-router", namePrefix)),
			Project: pulumi.String(project),
			Region:  pulumi.String(region),
			Network: network.ID(),
		})
		if err != nil {
			return err
		}

		_, err = compute.NewRouterNat(ctx, "nat-config", &compute.RouterNatArgs{
			Name:                             pulumi.String(fmt.Sprintf("%s-nat", namePrefix)),
			Project:                          pulumi.String(project),
			Region:                           pulumi.String(region),
			Router:                           router.Name,
			NatIpAllocateOption:              pulumi.String("AUTO_ONLY"),
			SourceSubnetworkIpRangesToNat:    pulumi.String("ALL_SUBNETWORKS_ALL_IP_RANGES"),
			LogConfig:                        &compute.RouterNatLogConfigArgs{Enable: pulumi.Bool(true), Filter: pulumi.String("ERRORS_ONLY")},
			EnableEndpointIndependentMapping: pulumi.Bool(true),
			UdpIdleTimeoutSec:                pulumi.Int(30),
			TcpEstablishedIdleTimeoutSec:     pulumi.Int(1200),
			TcpTransitoryIdleTimeoutSec:      pulumi.Int(30),
			IcmpIdleTimeoutSec:               pulumi.Int(30),
		}, pulumi.DependsOn([]pulumi.Resource{subnetwork}))
		if err != nil {
			return err
		}

		privateRange, err := compute.NewGlobalAddress(ctx, "sql-private-range", &compute.GlobalAddressArgs{
			Name:         pulumi.String(fmt.Sprintf("%s-sql-range", namePrefix)),
			Project:      pulumi.String(project),
			Purpose:      pulumi.String("VPC_PEERING"),
			AddressType:  pulumi.String("INTERNAL"),
			PrefixLength: pulumi.Int(16),
			Network:      network.ID(),
		}, pulumi.DependsOn([]pulumi.Resource{network}))
		if err != nil {
			return err
		}

		privateServiceConnection, err := servicenetworking.NewConnection(ctx, "private-service-connection", &servicenetworking.ConnectionArgs{
			Network:               network.ID(),
			Service:               pulumi.String("servicenetworking.googleapis.com"),
			ReservedPeeringRanges: pulumi.StringArray{privateRange.Name},
			DeletionPolicy:        pulumi.String("ABANDON"),
		}, pulumi.DependsOn([]pulumi.Resource{privateRange}))
		if err != nil {
			return err
		}

		artifactsBucket, err := storage.NewBucket(ctx, "translation-artifacts", &storage.BucketArgs{
			Name:                     pulumi.String(fmt.Sprintf("%s-artifacts", namePrefix)),
			Project:                  pulumi.String(project),
			Location:                 pulumi.String(strings.ToUpper(region)),
			UniformBucketLevelAccess: pulumi.Bool(true),
			PublicAccessPrevention:   pulumi.String("enforced"),
			ForceDestroy:             pulumi.Bool(false),
			Labels:                   labels,
			Versioning:               &storage.BucketVersioningArgs{Enabled: pulumi.Bool(true)},
		}, pulumi.DependsOn(services))
		if err != nil {
			return err
		}

		queueTopic, err := pubsub.NewTopic(ctx, "translation-job-topic", &pubsub.TopicArgs{
			Name:    pulumi.String(fmt.Sprintf("%s-translation-job-queued", namePrefix)),
			Project: pulumi.String(project),
			Labels:  labels,
		}, pulumi.DependsOn(services))
		if err != nil {
			return err
		}

		queueSubscription, err := pubsub.NewSubscription(ctx, "translation-job-subscription", &pubsub.SubscriptionArgs{
			Name:                     pulumi.String(fmt.Sprintf("%s-translation-worker", namePrefix)),
			Project:                  pulumi.String(project),
			Topic:                    queueTopic.Name,
			AckDeadlineSeconds:       pulumi.Int(600),
			RetainAckedMessages:      pulumi.Bool(false),
			MessageRetentionDuration: pulumi.String("604800s"),
			RetryPolicy:              &pubsub.SubscriptionRetryPolicyArgs{MinimumBackoff: pulumi.String("10s"), MaximumBackoff: pulumi.String("600s")},
			ExpirationPolicy:         &pubsub.SubscriptionExpirationPolicyArgs{Ttl: pulumi.String("")},
		}, pulumi.DependsOn([]pulumi.Resource{queueTopic}))
		if err != nil {
			return err
		}

		dbInstance, err := sql.NewDatabaseInstance(ctx, "translation-db-instance", &sql.DatabaseInstanceArgs{
			Name:               pulumi.String(fmt.Sprintf("%s-db", namePrefix)),
			Project:            pulumi.String(project),
			Region:             pulumi.String(region),
			DatabaseVersion:    pulumi.String(defaultDatabaseVersion),
			DeletionProtection: pulumi.Bool(true),
			Settings: &sql.DatabaseInstanceSettingsArgs{
				Tier:             pulumi.String(defaultDatabaseTier),
				AvailabilityType: pulumi.String("REGIONAL"),
				DiskType:         pulumi.String("PD_SSD"),
				DiskSize:         pulumi.Int(20),
				DiskAutoresize:   pulumi.Bool(true),
				ActivationPolicy: pulumi.String("ALWAYS"),
				UserLabels:       labels,
				BackupConfiguration: &sql.DatabaseInstanceSettingsBackupConfigurationArgs{
					Enabled:                    pulumi.Bool(true),
					PointInTimeRecoveryEnabled: pulumi.Bool(true),
				},
				IpConfiguration: &sql.DatabaseInstanceSettingsIpConfigurationArgs{
					Ipv4Enabled:    pulumi.Bool(false),
					PrivateNetwork: network.ID(),
					SslMode:        pulumi.String("ENCRYPTED_ONLY"),
				},
			},
		}, pulumi.DependsOn([]pulumi.Resource{privateServiceConnection}))
		if err != nil {
			return err
		}

		translationDB, err := sql.NewDatabase(ctx, "translation-db", &sql.DatabaseArgs{
			Name:     pulumi.String(defaultDatabaseName),
			Project:  pulumi.String(project),
			Instance: dbInstance.Name,
		})
		if err != nil {
			return err
		}

		dbUser, err := sql.NewUser(ctx, "translation-db-user", &sql.UserArgs{
			Name:     pulumi.String(defaultDatabaseUser),
			Project:  pulumi.String(project),
			Instance: dbInstance.Name,
			Password: databasePassword,
		})
		if err != nil {
			return err
		}

		databaseURL := pulumi.Sprintf(
			"postgres://%s:%s@%s:5432/%s?sslmode=disable",
			dbUser.Name,
			databasePassword,
			dbInstance.PrivateIpAddress,
			translationDB.Name,
		)

		apiServiceAccount, err := newServiceAccount(ctx, project, serviceAccountID(namePrefix, "api"), "Public REST API service")
		if err != nil {
			return err
		}
		translationServiceAccount, err := newServiceAccount(ctx, project, serviceAccountID(namePrefix, "translation"), "Private translation gRPC service")
		if err != nil {
			return err
		}
		dispatcherServiceAccount, err := newServiceAccount(ctx, project, serviceAccountID(namePrefix, "dispatcher"), "Private translation dispatcher worker pool")
		if err != nil {
			return err
		}
		workerServiceAccount, err := newServiceAccount(ctx, project, serviceAccountID(namePrefix, "worker"), "Private translation worker pool")
		if err != nil {
			return err
		}

		for _, binding := range []struct {
			name string
			role string
			sa   *serviceaccount.Account
		}{
			{name: "api-artifacts-reader", role: "roles/storage.objectViewer", sa: apiServiceAccount},
			{name: "translation-pubsub-publisher", role: "roles/pubsub.publisher", sa: translationServiceAccount},
			{name: "translation-storage-admin", role: "roles/storage.objectAdmin", sa: translationServiceAccount},
			{name: "dispatcher-pubsub-publisher", role: "roles/pubsub.publisher", sa: dispatcherServiceAccount},
			{name: "worker-pubsub-subscriber", role: "roles/pubsub.subscriber", sa: workerServiceAccount},
			{name: "worker-storage-admin", role: "roles/storage.objectAdmin", sa: workerServiceAccount},
		} {
			_, err = projects.NewIAMMember(ctx, binding.name, &projects.IAMMemberArgs{
				Project: pulumi.String(project),
				Role:    pulumi.String(binding.role),
				Member:  pulumi.Sprintf("serviceAccount:%s", binding.sa.Email),
			})
			if err != nil {
				return err
			}
		}

		translationService, err := cloudrunv2.NewService(ctx, "translation-service", &cloudrunv2.ServiceArgs{
			Name:               pulumi.String(fmt.Sprintf("%s-translation-service", namePrefix)),
			Project:            pulumi.String(project),
			Location:           pulumi.String(region),
			DeletionProtection: pulumi.Bool(false),
			Ingress:            pulumi.String("INGRESS_TRAFFIC_INTERNAL_ONLY"),
			InvokerIamDisabled: pulumi.Bool(true),
			Template: &cloudrunv2.ServiceTemplateArgs{
				ServiceAccount: translationServiceAccount.Email,
				Scaling: &cloudrunv2.ServiceTemplateScalingArgs{
					MinInstanceCount: pulumi.Int(1),
					MaxInstanceCount: pulumi.Int(4),
				},
				Containers: cloudrunv2.ServiceTemplateContainerArray{
					&cloudrunv2.ServiceTemplateContainerArgs{
						Image: pulumi.String(translationImage),
						Ports: cloudrunv2.ServiceTemplateContainerPortArray{
							&cloudrunv2.ServiceTemplateContainerPortArgs{ContainerPort: pulumi.Int(8080)},
						},
						Resources: &cloudrunv2.ServiceTemplateContainerResourcesArgs{Limits: pulumi.StringMap{"cpu": pulumi.String("1"), "memory": pulumi.String("1024Mi")}},
						Envs: cloudrunv2.ServiceTemplateContainerEnvArray{
							&cloudrunv2.ServiceTemplateContainerEnvArgs{Name: pulumi.String("DATABASE_URL"), Value: databaseURL},
							&cloudrunv2.ServiceTemplateContainerEnvArgs{Name: pulumi.String("TRANSLATION_QUEUE_DRIVER"), Value: pulumi.String("gcp-pubsub")},
							&cloudrunv2.ServiceTemplateContainerEnvArgs{Name: pulumi.String("TRANSLATION_OBJECT_STORE_DRIVER"), Value: pulumi.String("gcp")},
							&cloudrunv2.ServiceTemplateContainerEnvArgs{Name: pulumi.String("TRANSLATION_GCP_PUBSUB_PROJECT_ID"), Value: pulumi.String(project)},
							&cloudrunv2.ServiceTemplateContainerEnvArgs{Name: pulumi.String("TRANSLATION_GCP_PUBSUB_TOPIC"), Value: queueTopic.Name},
							&cloudrunv2.ServiceTemplateContainerEnvArgs{Name: pulumi.String("TRANSLATION_GCP_STORAGE_BUCKET"), Value: artifactsBucket.Name},
						},
					},
				},
				VpcAccess: &cloudrunv2.ServiceTemplateVpcAccessArgs{
					NetworkInterfaces: cloudrunv2.ServiceTemplateVpcAccessNetworkInterfaceArray{
						&cloudrunv2.ServiceTemplateVpcAccessNetworkInterfaceArgs{Network: network.ID(), Subnetwork: subnetwork.ID()},
					},
				},
			},
			Labels: labels,
		}, pulumi.DependsOn([]pulumi.Resource{queueTopic, translationDB, dbUser}))
		if err != nil {
			return err
		}

		apiService, err := cloudrunv2.NewService(ctx, "api-service", &cloudrunv2.ServiceArgs{
			Name:               pulumi.String(fmt.Sprintf("%s-api-service", namePrefix)),
			Project:            pulumi.String(project),
			Location:           pulumi.String(region),
			DeletionProtection: pulumi.Bool(false),
			Ingress:            pulumi.String("INGRESS_TRAFFIC_ALL"),
			InvokerIamDisabled: pulumi.Bool(true),
			Template: &cloudrunv2.ServiceTemplateArgs{
				ServiceAccount: apiServiceAccount.Email,
				Scaling: &cloudrunv2.ServiceTemplateScalingArgs{
					MinInstanceCount: pulumi.Int(1),
					MaxInstanceCount: pulumi.Int(10),
				},
				Containers: cloudrunv2.ServiceTemplateContainerArray{
					&cloudrunv2.ServiceTemplateContainerArgs{
						Image: pulumi.String(apiImage),
						Ports: cloudrunv2.ServiceTemplateContainerPortArray{
							&cloudrunv2.ServiceTemplateContainerPortArgs{ContainerPort: pulumi.Int(8080)},
						},
						Resources: &cloudrunv2.ServiceTemplateContainerResourcesArgs{Limits: pulumi.StringMap{"cpu": pulumi.String("1"), "memory": pulumi.String("1024Mi")}},
						Envs: cloudrunv2.ServiceTemplateContainerEnvArray{
							&cloudrunv2.ServiceTemplateContainerEnvArgs{Name: pulumi.String("TRANSLATION_GRPC_TARGET"), Value: translationService.Uri},
							&cloudrunv2.ServiceTemplateContainerEnvArgs{Name: pulumi.String("TRANSLATION_SERVICE_URL"), Value: translationService.Uri},
						},
					},
				},
				VpcAccess: &cloudrunv2.ServiceTemplateVpcAccessArgs{
					NetworkInterfaces: cloudrunv2.ServiceTemplateVpcAccessNetworkInterfaceArray{
						&cloudrunv2.ServiceTemplateVpcAccessNetworkInterfaceArgs{Network: network.ID(), Subnetwork: subnetwork.ID()},
					},
				},
			},
			Labels: labels,
		}, pulumi.DependsOn([]pulumi.Resource{translationService}))
		if err != nil {
			return err
		}

		dispatcherWorkerPool, err := cloudrunv2.NewWorkerPool(ctx, "dispatcher-worker-pool", &cloudrunv2.WorkerPoolArgs{
			Name:               pulumi.String(fmt.Sprintf("%s-dispatcher", namePrefix)),
			Project:            pulumi.String(project),
			Location:           pulumi.String(region),
			LaunchStage:        pulumi.String("BETA"),
			DeletionProtection: pulumi.Bool(false),
			Scaling: &cloudrunv2.WorkerPoolScalingArgs{
				ScalingMode:         pulumi.String("MANUAL"),
				ManualInstanceCount: pulumi.Int(1),
			},
			Template: &cloudrunv2.WorkerPoolTemplateArgs{
				ServiceAccount: dispatcherServiceAccount.Email,
				Containers: cloudrunv2.WorkerPoolTemplateContainerArray{
					&cloudrunv2.WorkerPoolTemplateContainerArgs{
						Image:     pulumi.String(dispatcherImage),
						Resources: &cloudrunv2.WorkerPoolTemplateContainerResourcesArgs{Limits: pulumi.StringMap{"cpu": pulumi.String("1"), "memory": pulumi.String("512Mi")}},
						Envs: cloudrunv2.WorkerPoolTemplateContainerEnvArray{
							&cloudrunv2.WorkerPoolTemplateContainerEnvArgs{Name: pulumi.String("DATABASE_URL"), Value: databaseURL},
							&cloudrunv2.WorkerPoolTemplateContainerEnvArgs{Name: pulumi.String("TRANSLATION_QUEUE_DRIVER"), Value: pulumi.String("gcp-pubsub")},
							&cloudrunv2.WorkerPoolTemplateContainerEnvArgs{Name: pulumi.String("TRANSLATION_GCP_PUBSUB_PROJECT_ID"), Value: pulumi.String(project)},
							&cloudrunv2.WorkerPoolTemplateContainerEnvArgs{Name: pulumi.String("TRANSLATION_GCP_PUBSUB_TOPIC"), Value: queueTopic.Name},
							&cloudrunv2.WorkerPoolTemplateContainerEnvArgs{Name: pulumi.String("TRANSLATION_DISPATCHER_POLL_INTERVAL"), Value: pulumi.String("2s")},
							&cloudrunv2.WorkerPoolTemplateContainerEnvArgs{Name: pulumi.String("TRANSLATION_DISPATCHER_BATCH_SIZE"), Value: pulumi.String("32")},
						},
					},
				},
				VpcAccess: &cloudrunv2.WorkerPoolTemplateVpcAccessArgs{
					NetworkInterfaces: cloudrunv2.WorkerPoolTemplateVpcAccessNetworkInterfaceArray{
						&cloudrunv2.WorkerPoolTemplateVpcAccessNetworkInterfaceArgs{Network: network.ID(), Subnetwork: subnetwork.ID()},
					},
				},
			},
			Labels: labels,
		}, pulumi.DependsOn([]pulumi.Resource{queueTopic, translationDB, dbUser}))
		if err != nil {
			return err
		}

		workerEnv := cloudrunv2.WorkerPoolTemplateContainerEnvArray{
			&cloudrunv2.WorkerPoolTemplateContainerEnvArgs{Name: pulumi.String("DATABASE_URL"), Value: databaseURL},
			&cloudrunv2.WorkerPoolTemplateContainerEnvArgs{Name: pulumi.String("TRANSLATION_QUEUE_DRIVER"), Value: pulumi.String("gcp-pubsub")},
			&cloudrunv2.WorkerPoolTemplateContainerEnvArgs{Name: pulumi.String("TRANSLATION_OBJECT_STORE_DRIVER"), Value: pulumi.String("gcp")},
			&cloudrunv2.WorkerPoolTemplateContainerEnvArgs{Name: pulumi.String("TRANSLATION_GCP_PUBSUB_PROJECT_ID"), Value: pulumi.String(project)},
			&cloudrunv2.WorkerPoolTemplateContainerEnvArgs{Name: pulumi.String("TRANSLATION_GCP_PUBSUB_TOPIC"), Value: queueTopic.Name},
			&cloudrunv2.WorkerPoolTemplateContainerEnvArgs{Name: pulumi.String("TRANSLATION_GCP_PUBSUB_SUBSCRIPTION"), Value: queueSubscription.Name},
			&cloudrunv2.WorkerPoolTemplateContainerEnvArgs{Name: pulumi.String("TRANSLATION_GCP_STORAGE_BUCKET"), Value: artifactsBucket.Name},
			&cloudrunv2.WorkerPoolTemplateContainerEnvArgs{Name: pulumi.String("TRANSLATION_LLM_PROVIDER"), Value: pulumi.String(llmProvider)},
			&cloudrunv2.WorkerPoolTemplateContainerEnvArgs{Name: pulumi.String("TRANSLATION_LLM_MODEL"), Value: pulumi.String(llmModel)},
		}
		if llmSystemPrompt != "" {
			workerEnv = append(workerEnv, &cloudrunv2.WorkerPoolTemplateContainerEnvArgs{Name: pulumi.String("TRANSLATION_LLM_SYSTEM_PROMPT"), Value: pulumi.String(llmSystemPrompt)})
		}
		if llmUserPrompt != "" {
			workerEnv = append(workerEnv, &cloudrunv2.WorkerPoolTemplateContainerEnvArgs{Name: pulumi.String("TRANSLATION_LLM_USER_PROMPT"), Value: pulumi.String(llmUserPrompt)})
		}

		workerPool, err := cloudrunv2.NewWorkerPool(ctx, "translation-worker-pool", &cloudrunv2.WorkerPoolArgs{
			Name:               pulumi.String(fmt.Sprintf("%s-worker", namePrefix)),
			Project:            pulumi.String(project),
			Location:           pulumi.String(region),
			LaunchStage:        pulumi.String("BETA"),
			DeletionProtection: pulumi.Bool(false),
			Scaling: &cloudrunv2.WorkerPoolScalingArgs{
				ScalingMode:      pulumi.String("AUTOMATIC"),
				MinInstanceCount: pulumi.Int(1),
				MaxInstanceCount: pulumi.Int(8),
			},
			Template: &cloudrunv2.WorkerPoolTemplateArgs{
				ServiceAccount: workerServiceAccount.Email,
				Containers: cloudrunv2.WorkerPoolTemplateContainerArray{
					&cloudrunv2.WorkerPoolTemplateContainerArgs{
						Image:     pulumi.String(workerImage),
						Resources: &cloudrunv2.WorkerPoolTemplateContainerResourcesArgs{Limits: pulumi.StringMap{"cpu": pulumi.String("2"), "memory": pulumi.String("2048Mi")}},
						Envs:      workerEnv,
					},
				},
				VpcAccess: &cloudrunv2.WorkerPoolTemplateVpcAccessArgs{
					NetworkInterfaces: cloudrunv2.WorkerPoolTemplateVpcAccessNetworkInterfaceArray{
						&cloudrunv2.WorkerPoolTemplateVpcAccessNetworkInterfaceArgs{Network: network.ID(), Subnetwork: subnetwork.ID()},
					},
				},
			},
			Labels: labels,
		}, pulumi.DependsOn([]pulumi.Resource{queueSubscription, artifactsBucket, translationDB, dbUser}))
		if err != nil {
			return err
		}

		ctx.Export("project", pulumi.String(project))
		ctx.Export("region", pulumi.String(region))
		ctx.Export("networkName", network.Name)
		ctx.Export("subnetworkName", subnetwork.Name)
		ctx.Export("databaseInstanceName", dbInstance.Name)
		ctx.Export("databasePrivateIp", dbInstance.PrivateIpAddress)
		ctx.Export("databaseName", translationDB.Name)
		ctx.Export("artifactsBucketName", artifactsBucket.Name)
		ctx.Export("translationTopicName", queueTopic.Name)
		ctx.Export("translationSubscriptionName", queueSubscription.Name)
		ctx.Export("translationServiceUrl", translationService.Uri)
		ctx.Export("publicApiUrl", apiService.Uri)
		ctx.Export("dispatcherWorkerPoolName", dispatcherWorkerPool.Name)
		ctx.Export("translationWorkerPoolName", workerPool.Name)

		return nil
	})
}

func enableRequiredServices(ctx *pulumi.Context, project string) ([]pulumi.Resource, error) {
	apiNames := []string{
		"artifactregistry.googleapis.com",
		"cloudresourcemanager.googleapis.com",
		"compute.googleapis.com",
		"iam.googleapis.com",
		"pubsub.googleapis.com",
		"run.googleapis.com",
		"servicenetworking.googleapis.com",
		"sqladmin.googleapis.com",
		"storage.googleapis.com",
	}

	resources := make([]pulumi.Resource, 0, len(apiNames))
	for _, apiName := range apiNames {
		resourceName := fmt.Sprintf("service-%s", sanitizeName(apiName))
		service, err := projects.NewService(ctx, resourceName, &projects.ServiceArgs{
			Project:                  pulumi.String(project),
			Service:                  pulumi.String(apiName),
			DisableDependentServices: pulumi.Bool(false),
			DisableOnDestroy:         pulumi.Bool(false),
		})
		if err != nil {
			return nil, err
		}
		resources = append(resources, service)
	}

	return resources, nil
}

func newServiceAccount(ctx *pulumi.Context, project, accountID, displayName string) (*serviceaccount.Account, error) {
	return serviceaccount.NewAccount(ctx, accountID, &serviceaccount.AccountArgs{
		Project:     pulumi.String(project),
		AccountId:   pulumi.String(accountID),
		DisplayName: pulumi.String(displayName),
		Disabled:    pulumi.Bool(false),
		Description: pulumi.String(displayName),
	})
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}

	return ""
}

func sanitizeName(value string) string {
	value = strings.ToLower(value)
	replacer := strings.NewReplacer("_", "-", ".", "-", "/", "-", ":", "-", " ", "-")
	value = replacer.Replace(value)
	value = strings.Trim(value, "-")
	if value == "" {
		return "default"
	}

	return value
}

func serviceAccountID(prefix, suffix string) string {
	return truncateTo(fmt.Sprintf("%s-%s", prefix, suffix), 30)
}

func truncateTo(value string, max int) string {
	if len(value) <= max {
		return value
	}

	return strings.TrimRight(value[:max], "-")
}
